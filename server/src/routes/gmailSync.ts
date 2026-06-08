import type Database from "better-sqlite3";
import type { Express } from "express";
import { google, type gmail_v1 } from "googleapis";
import { enhanceGmailSuggestionsWithAi } from "../ai/claude.js";
import { GMAIL_SYNC_MAX, isClaudeEnabled, googleOAuthEnv } from "../config.js";
import { createApplicationRepo } from "../db/applicationsRepo.js";
import { createLinksRepo } from "../db/linksRepo.js";
import {
  buildFieldUpdateSuggestions,
  mergeAiFieldSuggestions,
  type ApplicationSnapshot,
  type FieldUpdateSuggestion,
} from "../gmail/suggestFieldUpdates.js";
import { ApplicationPatch } from "../types/application.js";
import { createOAuthRepo, type StoredTokens } from "../db/oauthRepo.js";
import { createSyncStateRepo } from "../db/syncStateRepo.js";
import { fetchInboxThreads } from "../gmail/service.js";
import {
  scoreThreadAgainstApplication,
  type ApplicationRowForMatching,
} from "../matching/scoreThread.js";

type GmailSyncRouteDeps = {
  gmailFactory?: (oauth2Client: InstanceType<typeof google.auth.OAuth2>) => gmail_v1.Gmail;
  now?: () => Date;
};

function parseFromHeader(fromHeader: string): { fromDisplay: string | null; fromEmail: string | null } {
  const trimmed = fromHeader.trim();
  if (!trimmed) return { fromDisplay: null, fromEmail: null };
  const match = /^(.*?)(?:<([^>]+)>)?$/.exec(trimmed);
  if (!match) return { fromDisplay: trimmed, fromEmail: null };

  const display = (match[1] ?? "").replace(/^"|"$/g, "").trim();
  const email = (match[2] ?? "").trim().toLowerCase();
  return {
    fromDisplay: display || (email || null),
    fromEmail: email || null,
  };
}

function readHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const found = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? "";
}

function makeOAuth2Client(tokens: StoredTokens) {
  const { clientId, clientSecret, redirectUri } = googleOAuthEnv();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_ms ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
  });
  return oauth2Client;
}

async function refreshIfExpired(
  oauthRepo: ReturnType<typeof createOAuthRepo>,
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  tokens: StoredTokens,
): Promise<void> {
  const expiryMs = tokens.expiry_ms ?? 0;
  const expired = expiryMs > 0 && expiryMs <= Date.now();
  if (!expired) return;

  await oauth2Client.getAccessToken();
  oauthRepo.save({
    access_token: oauth2Client.credentials.access_token ?? null,
    refresh_token: oauth2Client.credentials.refresh_token ?? tokens.refresh_token ?? null,
    expiry_ms: oauth2Client.credentials.expiry_date ?? null,
    scope: oauth2Client.credentials.scope ?? tokens.scope ?? null,
    token_type: oauth2Client.credentials.token_type ?? tokens.token_type ?? null,
  });
}

export function registerGmailSyncRoutes(
  app: Express,
  db: Database.Database,
  deps: GmailSyncRouteDeps = {},
) {
  const oauthRepo = createOAuthRepo(db);
  const appRepo = createApplicationRepo(db);
  const linksRepo = createLinksRepo(db);
  const syncStateRepo = createSyncStateRepo(db);
  const now = deps.now ?? (() => new Date());
  const gmailFactory =
    deps.gmailFactory ??
    ((oauth2Client: InstanceType<typeof google.auth.OAuth2>) =>
      google.gmail({ version: "v1", auth: oauth2Client }));

  app.get("/api/v1/gmail/status", (_req, res) => {
    const tokens = oauthRepo.get();
    const connected = Boolean(tokens?.refresh_token && tokens?.access_token);
    const last_sync_at = syncStateRepo.get("last_sync_at") ?? null;
    res.json({ connected, last_sync_at });
  });

  app.post("/api/v1/gmail/sync", async (_req, res) => {
    try {
      const tokens = oauthRepo.get();
      if (!tokens?.refresh_token || !tokens?.access_token) {
        return res.status(401).json({ error: "gmail_not_connected" });
      }

      const oauth2Client = makeOAuth2Client(tokens);
      await refreshIfExpired(oauthRepo, oauth2Client, tokens);

      const gmail = gmailFactory(oauth2Client);
      const { threads, inboxEmpty } = await fetchInboxThreads(gmail, {
        maxResults: GMAIL_SYNC_MAX,
      });

      const syncedAt = now().toISOString();

      if (inboxEmpty) {
        syncStateRepo.set("last_sync_at", syncedAt);
        return res.json({
          suggestions: [],
          synced_at: syncedAt,
          inbox_empty: true,
          ai_used: false,
        });
      }
      const apps = appRepo.list() as ApplicationRowForMatching[];
      const existingThreadIds = new Set(linksRepo.listAllThreadIds());
      type SuggestionRow = {
        application_id: string;
        gmail_thread_id: string;
        subject: string;
        from: string;
        snippet: string;
        score: number;
        reason_codes: string[];
        ai_summary?: string;
        propose_create?: boolean;
        field_updates?: FieldUpdateSuggestion[];
      };

      const aiUpdatesByThread = new Map<string, NonNullable<import("../ai/claude.js").GmailAiSuggestion["application_updates"]>>();

      function appSnapshot(appId: string): ApplicationSnapshot | null {
        const row = appRepo.get(appId) as Record<string, unknown> | undefined;
        if (!row) return null;
        return {
          id: String(row.id),
          company: String(row.company ?? ""),
          title: String(row.title ?? ""),
          status: row.status as ApplicationSnapshot["status"],
          applied_date: (row.applied_date as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
          contact_name: (row.contact_name as string | null) ?? null,
          contact_email: (row.contact_email as string | null) ?? null,
          location: (row.location as string | null) ?? null,
          salary_min: (row.salary_min as number | null) ?? null,
          salary_max: (row.salary_max as number | null) ?? null,
        };
      }

      async function attachFieldUpdates(row: SuggestionRow): Promise<void> {
        if (row.propose_create || !row.application_id) return;
        const snap = appSnapshot(row.application_id);
        if (!snap) return;

        const email = { from: row.from, subject: row.subject, snippet: row.snippet };
        let updates = buildFieldUpdateSuggestions(snap, email, syncedAt);
        const batchAi = aiUpdatesByThread.get(row.gmail_thread_id);
        if (batchAi) {
          updates = mergeAiFieldSuggestions(updates, snap, batchAi);
        }
        if (updates.length > 0) row.field_updates = updates;
      }

      const suggestions: SuggestionRow[] = [];
      const aiThreadInput: Array<{
        gmail_thread_id: string;
        from: string;
        subject: string;
        snippet: string;
        heuristic_application_id: string | null;
        heuristic_score: number;
      }> = [];

      for (const thread of threads) {
        if (existingThreadIds.has(thread.threadId)) continue;

        let best:
          | {
              application_id: string;
              score: number;
              reason_codes: string[];
            }
          | undefined;

        for (const row of apps) {
          const score = scoreThreadAgainstApplication(row, thread);
          if (!best || score.score > best.score) {
            best = {
              application_id: score.application_id,
              score: score.score,
              reason_codes: score.reason_codes,
            };
          }
        }

        aiThreadInput.push({
          gmail_thread_id: thread.threadId,
          from: thread.fromDisplay || thread.fromEmail,
          subject: thread.subject,
          snippet: thread.snippet,
          heuristic_application_id: best?.application_id ?? null,
          heuristic_score: best?.score ?? 0,
        });

        if (!best || best.score < 25) continue;
        if (linksRepo.hasLink(best.application_id, thread.threadId)) continue;

        suggestions.push({
          application_id: best.application_id,
          gmail_thread_id: thread.threadId,
          subject: thread.subject,
          from: thread.fromDisplay || thread.fromEmail,
          snippet: thread.snippet,
          score: best.score,
          reason_codes: best.reason_codes,
        });
      }

      if (isClaudeEnabled() && aiThreadInput.length > 0) {
        try {
          const appList = (appRepo.list() as Array<{ id: string; company: string; title: string }>).map(
            (a) => ({
              id: a.id,
              company: a.company,
              title: a.title,
            }),
          );
          const aiRows = await enhanceGmailSuggestionsWithAi({
            applications: appList,
            threads: aiThreadInput,
          });
          if (aiRows) {
            const seen = new Set(suggestions.map((s) => s.gmail_thread_id));
            for (const row of aiRows) {
              if (row.confidence < 0.55) continue;
              const thread = threads.find((t) => t.threadId === row.gmail_thread_id);
              if (!thread) continue;

              if (row.application_updates) {
                aiUpdatesByThread.set(row.gmail_thread_id, row.application_updates);
              }

              if (row.application_id) {
                const existing = suggestions.find((s) => s.gmail_thread_id === row.gmail_thread_id);
                if (existing) {
                  existing.application_id = row.application_id;
                  existing.score = Math.max(existing.score, Math.round(row.confidence * 100));
                  existing.reason_codes = [...new Set([...existing.reason_codes, "ai_match"])];
                  existing.ai_summary = row.summary;
                } else if (!seen.has(row.gmail_thread_id) && !existingThreadIds.has(row.gmail_thread_id)) {
                  suggestions.push({
                    application_id: row.application_id,
                    gmail_thread_id: row.gmail_thread_id,
                    subject: thread.subject,
                    from: thread.fromDisplay || thread.fromEmail,
                    snippet: thread.snippet,
                    score: Math.round(row.confidence * 100),
                    reason_codes: ["ai_match"],
                    ai_summary: row.summary,
                  });
                  seen.add(row.gmail_thread_id);
                }
              } else if (row.create_application && !seen.has(row.gmail_thread_id)) {
                const firstApp = appList[0];
                suggestions.push({
                  application_id: firstApp?.id ?? "",
                  gmail_thread_id: row.gmail_thread_id,
                  subject: thread.subject,
                  from: thread.fromDisplay || thread.fromEmail,
                  snippet: `${row.summary}\n\n${thread.snippet}`.slice(0, 500),
                  score: Math.round(row.confidence * 100),
                  reason_codes: ["ai_new_role"],
                  ai_summary: row.summary,
                  propose_create: true,
                });
                seen.add(row.gmail_thread_id);
              }
            }
          }
        } catch {
          /* keep heuristic suggestions only */
        }
      }

      const enrichTargets = suggestions.filter((s) => !s.propose_create && s.application_id).slice(0, 15);
      await Promise.all(enrichTargets.map((row) => attachFieldUpdates(row)));

      syncStateRepo.set("last_sync_at", syncedAt);
      return res.json({
        suggestions,
        synced_at: syncedAt,
        inbox_empty: false,
        ai_used: isClaudeEnabled(),
      });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/v1/suggestions/confirm", (req, res) => {
    const application_id =
      typeof req.body?.application_id === "string" ? req.body.application_id : "";
    const gmail_thread_id =
      typeof req.body?.gmail_thread_id === "string" ? req.body.gmail_thread_id : "";
    const link_thread = req.body?.link_thread !== false;
    const parsedPatch = ApplicationPatch.safeParse(req.body?.field_updates ?? {});

    if (!application_id || !gmail_thread_id) {
      return res.status(400).json({ error: "application_id and gmail_thread_id are required" });
    }
    if (!parsedPatch.success) {
      return res.status(400).json(parsedPatch.error.flatten());
    }

    try {
      if (!appRepo.get(application_id)) {
        return res.status(404).json({ error: "application_not_found" });
      }

      const patch = parsedPatch.data;
      const hasPatch = Object.keys(patch).length > 0;
      if (hasPatch) {
        const updated = appRepo.update(application_id, patch);
        if (!updated) {
          return res.status(404).json({ error: "application_not_found" });
        }
      }

      let link = null;
      if (link_thread) {
        if (linksRepo.hasLink(application_id, gmail_thread_id)) {
          const existing = linksRepo.listByApplication(application_id).find(
            (row) => row.gmail_thread_id === gmail_thread_id,
          );
          link = existing ?? null;
        } else {
          try {
            link = linksRepo.insert(application_id, gmail_thread_id);
          } catch (err) {
            const status = typeof (err as { status?: unknown }).status === "number"
              ? (err as { status: number }).status
              : 500;
            if (status === 409) {
              const existing = linksRepo.listByApplication(application_id).find(
                (row) => row.gmail_thread_id === gmail_thread_id,
              );
              link = existing ?? null;
            } else {
              throw err;
            }
          }
        }
      }

      return res.status(201).json({
        link,
        application_updated: hasPatch,
      });
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === "number"
        ? ((err as { status: number }).status)
        : 500;
      return res.status(status).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/v1/applications/:id/threads", async (req, res) => {
    const applicationId = req.params.id;
    const links = linksRepo.listByApplication(applicationId);
    const tokens = oauthRepo.get();

    if (!tokens?.refresh_token || !tokens?.access_token) {
      return res.json({
        threads: links.map((link) => ({
          threadId: link.gmail_thread_id,
          subject: null,
          snippet: null,
          fromDisplay: null,
          fromEmail: null,
          placeholder: true,
        })),
      });
    }

    try {
      const oauth2Client = makeOAuth2Client(tokens);
      await refreshIfExpired(oauthRepo, oauth2Client, tokens);
      const gmail = gmailFactory(oauth2Client);

      const threads = await Promise.all(
        links.map(async (link) => {
          try {
            const detail = await gmail.users.threads.get({
              userId: "me",
              id: link.gmail_thread_id,
              format: "metadata",
              metadataHeaders: ["From", "Subject"],
            });
            const message = detail.data.messages?.[0];
            const headers = message?.payload?.headers;
            const from = parseFromHeader(readHeader(headers, "From"));
            return {
              threadId: link.gmail_thread_id,
              subject: readHeader(headers, "Subject") || null,
              snippet: detail.data.snippet ?? null,
              fromDisplay: from.fromDisplay,
              fromEmail: from.fromEmail,
              placeholder: false,
            };
          } catch {
            return {
              threadId: link.gmail_thread_id,
              subject: null,
              snippet: null,
              fromDisplay: null,
              fromEmail: null,
              placeholder: true,
            };
          }
        }),
      );

      return res.json({ threads });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
