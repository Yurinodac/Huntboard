import type Database from "better-sqlite3";
import type { Express } from "express";
import { z } from "zod";
import { createApplicationRepo } from "../db/applicationsRepo.js";
import { createLinksRepo } from "../db/linksRepo.js";
import { extractApplicationFromEmail } from "../import/extractFromEmail.js";
import { refineEmailToApplicationWithAi, refineJobPostingWithAi } from "../ai/claude.js";
import {
  fetchJobPage,
  JobPageFetchError,
  parseJobPageHtml,
  parsePastedJobText,
  type JobPageExtract,
} from "../import/parseJobPage.js";
import { CLAUDE_MODEL, isClaudeEnabled } from "../config.js";
import { ApplicationCreate, ApplicationPatch, type ApplicationSourceValue } from "../types/application.js";
import { detectSourceFromPostingUrl } from "../import/detectSource.js";

const ImportUrlBody = z.object({ url: z.string().url() });

const ImportPasteBody = z.object({
  text: z.string().min(40),
  url: z.string().url().optional(),
});

function sourceForCreate(
  postingUrl: string | null | undefined,
  override?: ApplicationSourceValue,
): ApplicationSourceValue {
  if (override) return override;
  return detectSourceFromPostingUrl(postingUrl);
}

async function buildJobImportPreview(
  url: string,
  extracted: JobPageExtract,
  pageExcerpt: string,
) {
  const warnings = [...extracted.warnings];
  const sources = [...extracted.sources];

  let preview = {
    company: extracted.company,
    title: extracted.title,
    posting_url: extracted.posting_url || url,
    location: extracted.location,
    work_arrangement: extracted.work_arrangement ?? ("unknown" as const),
    job_summary: extracted.job_summary,
    notes: extracted.notes,
    salary_min: extracted.salary_min,
    salary_max: extracted.salary_max,
    status: "applied" as const,
    file_links: [] as string[],
    source: detectSourceFromPostingUrl(extracted.posting_url || url),
  };

  if (isClaudeEnabled()) {
    try {
      const ai = await refineJobPostingWithAi({
        url,
        heuristic: {
          company: preview.company,
          title: preview.title,
          job_summary: preview.job_summary,
          location: preview.location,
          work_arrangement: preview.work_arrangement,
          notes: preview.notes,
          salary_min: preview.salary_min,
          salary_max: preview.salary_max,
        },
        pageExcerpt,
      });
      if (ai) {
        preview = {
          ...preview,
          company: ai.company || preview.company,
          title: ai.title || preview.title,
          job_summary: ai.job_summary ?? preview.job_summary,
          location: ai.location ?? preview.location,
          work_arrangement: ai.work_arrangement ?? preview.work_arrangement,
          notes: ai.notes ?? preview.notes,
          salary_min: ai.salary_min ?? preview.salary_min,
          salary_max: ai.salary_max ?? preview.salary_max,
        };
        sources.push("claude");
      }
    } catch (err) {
      warnings.push(
        `AI refinement skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (sources.includes("paste")) {
    warnings.push("Set ANTHROPIC_API_KEY in .env for smarter parsing of pasted job text.");
  }

  return { preview, sources, warnings, ai_used: sources.includes("claude") };
}

const FromEmailBody = z.object({
  from: z.string().min(1),
  subject: z.string().min(1),
  snippet: z.string().optional(),
  gmail_thread_id: z.string().optional(),
});

export function registerApplicationsRoutes(app: Express, db: Database.Database) {
  const repo = createApplicationRepo(db);
  const linksRepo = createLinksRepo(db);

  app.get("/api/v1/applications", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(repo.list(status));
  });

  app.get("/api/v1/ai/status", (_req, res) => {
    res.json({ enabled: isClaudeEnabled(), model: isClaudeEnabled() ? CLAUDE_MODEL : null });
  });

  app.post("/api/v1/applications/import-url", async (req, res) => {
    const parsed = ImportUrlBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const html = await fetchJobPage(parsed.data.url);
      const extracted = parseJobPageHtml(html, parsed.data.url);
      const excerpt = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
      const result = await buildJobImportPreview(parsed.data.url, extracted, excerpt);
      res.json(result);
    } catch (err) {
      if (err instanceof JobPageFetchError) {
        return res.status(422).json({ error: err.message, code: err.code });
      }
      res.status(502).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/v1/applications/import-paste", async (req, res) => {
    const parsed = ImportPasteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const url = parsed.data.url ?? "";
      const extracted = parsePastedJobText(parsed.data.text, url || undefined);
      const result = await buildJobImportPreview(
        url || "pasted://job-description",
        extracted,
        parsed.data.text,
      );
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/v1/applications/from-email", async (req, res) => {
    const parsed = FromEmailBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const extracted = extractApplicationFromEmail({
      from: parsed.data.from,
      subject: parsed.data.subject,
      snippet: parsed.data.snippet,
    });

    let company = extracted.company;
    let title = extracted.title;
    let job_summary = extracted.notes;
    let notes = extracted.notes;

    if (isClaudeEnabled()) {
      try {
        const ai = await refineEmailToApplicationWithAi({
          from: parsed.data.from,
          subject: parsed.data.subject,
          snippet: parsed.data.snippet,
        });
        if (ai) {
          company = ai.company || company;
          title = ai.title || title;
          job_summary = ai.job_summary ?? job_summary;
          notes = ai.notes ?? notes;
        }
      } catch {
        /* keep heuristic */
      }
    }

    const createPayload = ApplicationCreate.safeParse({
      company,
      title,
      status: "applied",
      applied_date: new Date().toISOString().slice(0, 10),
      contact_email: extracted.contact_email ?? "",
      contact_name: extracted.contact_name,
      notes,
      job_summary,
      work_arrangement: "unknown",
      file_links: [],
    });
    if (!createPayload.success) {
      return res.status(400).json(createPayload.error.flatten());
    }

    const row = repo.insert(createPayload.data, sourceForCreate(undefined, "email")) as { id: string };
    if (parsed.data.gmail_thread_id) {
      try {
        linksRepo.insert(row.id, parsed.data.gmail_thread_id);
      } catch {
        /* link may already exist */
      }
    }
    res.status(201).json(row);
  });

  app.post("/api/v1/applications", (req, res) => {
    const parsed = ApplicationCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const source = sourceForCreate(parsed.data.posting_url);
    res.status(201).json(repo.insert(parsed.data, source));
  });

  app.get("/api/v1/applications/:id/history", (req, res) => {
    const row = repo.get(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ history: repo.listStatusHistory(req.params.id) });
  });

  app.get("/api/v1/applications/:id", (req, res) => {
    const row = repo.get(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  });

  app.patch("/api/v1/applications/:id", (req, res) => {
    const parsed = ApplicationPatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const row = repo.update(req.params.id, parsed.data);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  });

  app.delete("/api/v1/applications/:id", (req, res) => {
    repo.delete(req.params.id);
    res.status(204).end();
  });
}
