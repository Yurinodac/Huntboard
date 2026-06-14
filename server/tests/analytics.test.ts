import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApplicationRepo } from "../src/db/applicationsRepo.js";
import { createResumesRepo } from "../src/db/resumesRepo.js";
import { migrate } from "../src/db/migrate.js";
import { openDatabase } from "../src/db/pool.js";
import { buildAnalyticsSummary } from "../src/analytics/summary.js";
import { registerAnalyticsRoutes } from "../src/routes/analytics.js";
import { registerApplicationsRoutes } from "../src/routes/applications.js";

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-analytics-"));
  const db = openDatabase(path.join(dir, "x.db"));
  migrate(db);
  const app = express();
  app.use(express.json());
  registerAnalyticsRoutes(app, db);
  registerApplicationsRoutes(app, db);
  return { app, db };
}

describe("analytics", () => {
  it("records status history and key dates on create and patch", async () => {
    const { app, db } = makeApp();
    const created = await request(app).post("/api/v1/applications").send({
      company: "Acme",
      title: "Engineer",
      status: "applied",
      posting_url: "https://careers.acme.com/jobs/1",
    });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("company_site");

    const history1 = await request(app).get(
      `/api/v1/applications/${created.body.id}/history`,
    );
    expect(history1.body.history).toHaveLength(1);
    expect(history1.body.history[0].to_status).toBe("applied");

    const patched = await request(app)
      .patch(`/api/v1/applications/${created.body.id}`)
      .send({ status: "interview" });
    expect(patched.status).toBe(200);
    expect(patched.body.first_interview_at).toBeTruthy();

    const history2 = await request(app).get(
      `/api/v1/applications/${created.body.id}/history`,
    );
    expect(history2.body.history).toHaveLength(2);
    expect(history2.body.history[1].from_status).toBe("applied");
    expect(history2.body.history[1].to_status).toBe("interview");

    const row = db
      .prepare(`SELECT rejected_at FROM applications WHERE id = ?`)
      .get(created.body.id) as { rejected_at: string | null };
    expect(row.rejected_at).toBeNull();
  });

  it("counts positive progression separately from rejected", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-analytics-"));
    const db = openDatabase(path.join(dir, "x.db"));
    migrate(db);
    const appRepo = createApplicationRepo(db);

    appRepo.insert(
      { company: "A", title: "T", status: "applied", work_arrangement: "unknown", file_links: [] },
    );
    appRepo.insert(
      { company: "B", title: "T", status: "recruiter_screen", work_arrangement: "unknown", file_links: [] },
    );
    appRepo.insert(
      { company: "C", title: "T", status: "interview", work_arrangement: "unknown", file_links: [] },
    );
    appRepo.insert(
      { company: "D", title: "T", status: "rejected", work_arrangement: "unknown", file_links: [] },
    );
    appRepo.insert(
      { company: "E", title: "T", status: "offer", work_arrangement: "unknown", file_links: [] },
    );

    const summary = buildAnalyticsSummary(db);
    expect(summary.total).toBe(5);
    expect(summary.funnel.positive_progress).toBe(2);
    expect(summary.funnel.interview).toBe(1);
    expect(summary.funnel.offer).toBe(1);
    expect(summary.funnel.rejected).toBe(1);
  });

  it("groups funnel metrics by resume version", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-analytics-"));
    const db = openDatabase(path.join(dir, "x.db"));
    migrate(db);
    const appRepo = createApplicationRepo(db);
    const resumeRepo = createResumesRepo(db);

    const v1 = resumeRepo.insert({
      label: "Resume A",
      original_filename: "a.pdf",
      stored_filename: "a.pdf",
    });
    const v2 = resumeRepo.insert({
      label: "Resume B",
      original_filename: "b.pdf",
      stored_filename: "b.pdf",
    });

    appRepo.insert(
      {
        company: "Co",
        title: "T",
        status: "interview",
        work_arrangement: "unknown",
        file_links: [],
        resume_version_id: v1.id,
      },
    );
    appRepo.insert(
      {
        company: "Co",
        title: "T",
        status: "applied",
        work_arrangement: "unknown",
        file_links: [],
        resume_version_id: v2.id,
      },
    );
    appRepo.insert(
      {
        company: "Co",
        title: "T",
        status: "rejected",
        work_arrangement: "unknown",
        file_links: [],
      },
    );

    const summary = buildAnalyticsSummary(db);
    expect(summary.by_resume).toHaveLength(3);
    const rowA = summary.by_resume.find((r) => r.label === "Resume A");
    expect(rowA?.positive_progress).toBe(1);
    expect(rowA?.interview).toBe(1);
    expect(summary.by_resume.find((r) => r.label === "No resume attached")?.rejected).toBe(1);
  });

  it("exports CSV and returns summary", async () => {
    const { app } = makeApp();
    await request(app).post("/api/v1/applications").send({
      company: "Stripe",
      title: "SWE",
      status: "rejected",
      posting_url: "https://www.linkedin.com/jobs/1",
    });

    const summary = await request(app).get("/api/v1/analytics/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBe(1);
    expect(summary.body.by_source.linkedin).toBe(1);
    expect(summary.body.funnel.rejected).toBe(1);
    expect(summary.body.funnel.positive_progress).toBe(0);
    expect(summary.body.funnel).not.toHaveProperty("progressed");

    const csv = await request(app).get("/api/v1/applications/export.csv");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("company,title,status,source");
    expect(csv.text).toContain("Stripe");
    expect(csv.text).toContain("linkedin");
  });
});
