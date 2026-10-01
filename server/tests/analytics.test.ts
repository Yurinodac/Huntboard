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

  it("counts current funnel separately from historical conversion", () => {
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
    expect(summary.funnel.active).toBe(4);
    expect(summary.funnel.positive_progress).toBe(2);
    expect(summary.funnel.interview).toBe(1);
    expect(summary.funnel.offer).toBe(1);
    expect(summary.funnel.rejected).toBe(1);
    expect(summary.conversion.ever_positive_progress).toBe(2);
    expect(summary.conversion.ever_interview).toBe(1);
  });

  it("counts historical resume milestones after rejection", () => {
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

    const created = appRepo.insert({
      company: "Co",
      title: "T",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
      resume_version_id: v1.id,
    }) as { id: string };

    appRepo.update(created.id, { status: "interview" });
    appRepo.update(created.id, { status: "rejected" });

    const summary = buildAnalyticsSummary(db);
    const rowA = summary.by_resume.find((r) => r.label === "Resume A");
    expect(rowA?.ever_interview).toBe(1);
    expect(rowA?.ever_rejected).toBe(1);
    expect(rowA?.rate_interview).toBe(100);
    expect(summary.funnel.interview).toBe(0);
    expect(summary.conversion.ever_interview).toBe(1);
  });

  it("groups resume metrics with no-resume bucket", () => {
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

    appRepo.insert({
      company: "Co",
      title: "T",
      status: "interview",
      work_arrangement: "unknown",
      file_links: [],
      resume_version_id: v1.id,
    });
    appRepo.insert({
      company: "Co",
      title: "T",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
    });
    appRepo.insert({
      company: "Co",
      title: "T",
      status: "rejected",
      work_arrangement: "unknown",
      file_links: [],
    });

    const summary = buildAnalyticsSummary(db);
    expect(summary.by_resume).toHaveLength(2);
    const rowA = summary.by_resume.find((r) => r.label === "Resume A");
    expect(rowA?.ever_positive_progress).toBe(1);
    expect(rowA?.ever_interview).toBe(1);
    expect(summary.by_resume.find((r) => r.label === "No resume attached")?.ever_rejected).toBe(1);
  });

  it("exports CSV and returns summary with conversion stats", async () => {
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
    expect(summary.body.by_source_performance).toHaveLength(1);
    expect(summary.body.by_source_performance[0].source).toBe("linkedin");
    expect(summary.body.funnel.rejected).toBe(1);
    expect(summary.body.funnel.positive_progress).toBe(0);
    expect(summary.body.conversion.ever_rejected).toBe(1);
    expect(summary.body.conversion).toHaveProperty("rate_interview");
    expect(summary.body.this_month).toHaveProperty("applications_logged");
    expect(summary.body.pace_weeks).toHaveLength(8);

    const list = await request(app).get("/api/v1/applications");
    expect(list.body[0].statuses_ever_reached).toContain("rejected");

    const csv = await request(app).get("/api/v1/applications/export.csv");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("company,title,status,source");
    expect(csv.text).toContain("Stripe");
    expect(csv.text).toContain("linkedin");
  });
});
