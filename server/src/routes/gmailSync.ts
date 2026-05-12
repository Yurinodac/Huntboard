import type Database from "better-sqlite3";
import type { Express } from "express";
import { google, type gmail_v1 } from "googleapis";
import { GMAIL_SYNC_DAYS, GMAIL_SYNC_MAX, googleOAuthEnv } from "../config.js";
import { createApplicationRepo } from "../db/applicationsRepo.js";
import { createLinksRepo } from "../db/linksRepo.js";
import { createOAuthRepo, type StoredTokens } from "../db/oauthRepo.js";
import { createSyncStateRepo } from "../db/syncStateRepo.js";
import { fetchRecentThreads } from "../gmail/service.js";
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
      const threads = await fetchRecentThreads(gmail, {
        newerThanDays: GMAIL_SYNC_DAYS,
        maxResults: GMAIL_SYNC_MAX,
      });

      const apps = appRepo.list() as ApplicationRowForMatching[];
      const existingThreadIds = new Set(linksRepo.listAllThreadIds());
      const suggestions: Array<{
        application_id: string;
        gmail_thread_id: string;
        subject: string;
        from: string;
        snippet: string;
        score: number;
        reason_codes: string[];
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

      const syncedAt = now().toISOString();
      syncStateRepo.set("last_sync_at", syncedAt);
      return res.json({ suggestions, synced_at: syncedAt });
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

    if (!application_id || !gmail_thread_id) {
      return res.status(400).json({ error: "application_id and gmail_thread_id are required" });
    }

    try {
      const link = linksRepo.insert(application_id, gmail_thread_id);
      return res.status(201).json(link);
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
