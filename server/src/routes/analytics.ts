import type Database from "better-sqlite3";
import type { Express } from "express";
import { applicationsToCsv } from "../analytics/exportCsv.js";
import { buildAnalyticsSummary } from "../analytics/summary.js";

export function registerAnalyticsRoutes(app: Express, db: Database.Database) {
  app.get("/api/v1/analytics/summary", (_req, res) => {
    res.json(buildAnalyticsSummary(db));
  });

  app.get("/api/v1/applications/export.csv", (_req, res) => {
    const csv = applicationsToCsv(db);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="huntboard-applications.csv"');
    res.send(csv);
  });
}
