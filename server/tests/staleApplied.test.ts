import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { openDatabase } from "../src/db/pool.js";
import { registerApplicationsRoutes } from "../src/routes/applications.js";

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-stale-"));
  const db = openDatabase(path.join(dir, "x.db"));
  migrate(db);
  const app = express();
  app.use(express.json());
  registerApplicationsRoutes(app, db);
  return { app, db };
}

function backdateAppliedHistory(db: ReturnType<typeof openDatabase>, applicationId: string, iso: string) {
  db.prepare(
    `UPDATE application_status_history
     SET changed_at = ?
     WHERE application_id = ? AND to_status = 'applied'`,
  ).run(iso, applicationId);
}

describe("stale applied applications", () => {
  it("lists applications stuck in applied for 30+ days without forward movement", async () => {
    const { app, db } = makeApp();
    const stale = await request(app).post("/api/v1/applications").send({
      company: "Stale Co",
      title: "Engineer",
      status: "applied",
      applied_date: "2026-01-01",
    });
    const fresh = await request(app).post("/api/v1/applications").send({
      company: "Fresh Co",
      title: "Engineer",
      status: "applied",
      applied_date: "2026-06-01",
    });
    backdateAppliedHistory(db, stale.body.id, "2026-01-15T12:00:00.000Z");

    const list = await request(app).get("/api/v1/applications/stale-applied?days=30");
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.applications[0].company).toBe("Stale Co");
    expect(list.body.applications.map((row: { id: string }) => row.id)).not.toContain(fresh.body.id);
  });

  it("excludes applications that progressed beyond applied", async () => {
    const { app, db } = makeApp();
    const created = await request(app).post("/api/v1/applications").send({
      company: "Moved Co",
      title: "Engineer",
      status: "applied",
      applied_date: "2026-01-01",
    });
    backdateAppliedHistory(db, created.body.id, "2026-01-15T12:00:00.000Z");
    await request(app)
      .patch(`/api/v1/applications/${created.body.id}`)
      .send({ status: "interview" });

    const list = await request(app).get("/api/v1/applications/stale-applied?days=30");
    expect(list.body.count).toBe(0);
  });

  it("archives stale applied applications", async () => {
    const { app, db } = makeApp();
    const stale = await request(app).post("/api/v1/applications").send({
      company: "Archive Me",
      title: "Engineer",
      status: "applied",
      applied_date: "2026-01-01",
    });
    backdateAppliedHistory(db, stale.body.id, "2026-01-15T12:00:00.000Z");

    const archived = await request(app)
      .post("/api/v1/applications/archive-stale")
      .send({ days: 30 });
    expect(archived.status).toBe(200);
    expect(archived.body.archived_count).toBe(1);
    expect(archived.body.archived[0].company).toBe("Archive Me");

    const row = await request(app).get(`/api/v1/applications/${stale.body.id}`);
    expect(row.body.status).toBe("archived");

    const staleFlag = db
      .prepare(`SELECT stale_archived_at FROM applications WHERE id = ?`)
      .get(stale.body.id) as { stale_archived_at: string | null };
    expect(staleFlag.stale_archived_at).toBeTruthy();

    const history = await request(app).get(`/api/v1/applications/${stale.body.id}/history`);
    expect(history.body.history.at(-1).to_status).toBe("archived");
  });
});
