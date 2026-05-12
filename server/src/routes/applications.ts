import type Database from "better-sqlite3";
import type { Express } from "express";
import { createApplicationRepo } from "../db/applicationsRepo.js";
import { ApplicationCreate, ApplicationPatch } from "../types/application.js";

export function registerApplicationsRoutes(app: Express, db: Database.Database) {
  const repo = createApplicationRepo(db);

  app.get("/api/v1/applications", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(repo.list(status));
  });

  app.post("/api/v1/applications", (req, res) => {
    const parsed = ApplicationCreate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    res.status(201).json(repo.insert(parsed.data));
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
