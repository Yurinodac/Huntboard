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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-app-"));
  const db = openDatabase(path.join(dir, "x.db"));
  migrate(db);
  const app = express();
  app.use(express.json());
  registerApplicationsRoutes(app, db);
  return app;
}

describe("applications API", () => {
  it("creates and lists", async () => {
    const app = makeApp();
    const c = await request(app).post("/api/v1/applications").send({
      company: "Acme",
      title: "Engineer",
      status: "applied",
    });
    expect(c.status).toBe(201);
    expect(c.body.source).toBe("manual");
    const list = await request(app).get("/api/v1/applications");
    expect(list.body.length).toBe(1);
    expect(list.body[0].company).toBe("Acme");
  });

  it("deletes an application", async () => {
    const app = makeApp();
    const created = await request(app).post("/api/v1/applications").send({
      company: "Acme",
      title: "Engineer",
      status: "applied",
    });
    const del = await request(app).delete(`/api/v1/applications/${created.body.id}`);
    expect(del.status).toBe(204);
    const list = await request(app).get("/api/v1/applications");
    expect(list.body.length).toBe(0);
  });

  it("keeps list order by created_at when an older row is patched", async () => {
    const app = makeApp();
    const first = await request(app).post("/api/v1/applications").send({
      company: "First",
      title: "Role",
      status: "applied",
      applied_date: "2026-01-01",
    });
    const second = await request(app).post("/api/v1/applications").send({
      company: "Second",
      title: "Role",
      status: "applied",
      applied_date: "2026-01-01",
    });
    await request(app)
      .patch(`/api/v1/applications/${first.body.id}`)
      .send({ notes: "updated later" });

    const list = await request(app).get("/api/v1/applications");
    expect(list.body[0].company).toBe("Second");
    expect(list.body[1].company).toBe("First");
  });
});
