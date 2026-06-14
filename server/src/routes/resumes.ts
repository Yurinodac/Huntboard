import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { Express } from "express";
import { z } from "zod";
import { DATA_DIR } from "../config.js";
import { createResumesRepo } from "../db/resumesRepo.js";

const RESUMES_DIR = path.join(DATA_DIR, "resumes");
const MAX_BYTES = 8 * 1024 * 1024;

const ResumeCreate = z.object({
  label: z.string().min(1).optional(),
  filename: z.string().min(1),
  mime_type: z.string().optional(),
  notes: z.string().optional(),
  content_base64: z.string().min(1),
});

const ResumePatch = z.object({
  label: z.string().min(1),
});

function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  return base || "resume.pdf";
}

export function registerResumesRoutes(app: Express, db: Database.Database) {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
  const repo = createResumesRepo(db);

  app.get("/api/v1/resumes", (_req, res) => {
    res.json({ resumes: repo.list() });
  });

  app.post("/api/v1/resumes", (req, res) => {
    const parsed = ResumeCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    let bytes: Buffer;
    try {
      bytes = Buffer.from(parsed.data.content_base64, "base64");
    } catch {
      return res.status(400).json({ error: "invalid_base64" });
    }
    if (bytes.length === 0) {
      return res.status(400).json({ error: "empty_file" });
    }
    if (bytes.length > MAX_BYTES) {
      return res.status(400).json({ error: "file_too_large", max_bytes: MAX_BYTES });
    }

    const stored_filename = `${cryptoRandom()}_${safeFilename(parsed.data.filename)}`;
    const stored_path = path.join(RESUMES_DIR, stored_filename);
    fs.writeFileSync(stored_path, bytes);

    const label =
      parsed.data.label?.trim() ||
      safeFilename(parsed.data.filename).replace(/\.[^.]+$/, "") ||
      "Resume";

    const row = repo.insert({
      label,
      original_filename: safeFilename(parsed.data.filename),
      stored_filename,
      mime_type: parsed.data.mime_type ?? null,
      notes: parsed.data.notes ?? null,
    });

    res.status(201).json(row);
  });

  app.get("/api/v1/resumes/:id/file", (req, res) => {
    const row = repo.get(req.params.id);
    if (!row) return res.status(404).json({ error: "not_found" });

    const filePath = path.join(RESUMES_DIR, row.stored_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "file_missing" });
    }

    if (row.mime_type) res.setHeader("Content-Type", row.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${row.original_filename.replace(/"/g, "")}"`,
    );
    res.sendFile(filePath);
  });

  app.patch("/api/v1/resumes/:id", (req, res) => {
    const parsed = ResumePatch.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const row = repo.updateLabel(req.params.id, parsed.data.label);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  });

  app.delete("/api/v1/resumes/:id", (req, res) => {
    const row = repo.get(req.params.id);
    if (!row) return res.status(404).json({ error: "not_found" });

    const inUse = repo.countApplicationsUsing(row.id);
    if (inUse > 0) {
      return res.status(409).json({
        error: "resume_in_use",
        applications: inUse,
      });
    }

    const filePath = path.join(RESUMES_DIR, row.stored_filename);
    repo.delete(row.id);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* file may already be gone */
    }
    res.status(204).end();
  });
}

function cryptoRandom(): string {
  return crypto.randomUUID().slice(0, 8);
}
