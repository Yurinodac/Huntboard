import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { openDatabase } from "../src/db/pool.js";
import { registerResumesRoutes } from "../src/routes/resumes.js";

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-resume-"));
  process.env.DATA_DIR = dir;
  const db = openDatabase(path.join(dir, "x.db"));
  migrate(db);
  const app = express();
  app.use(express.json());
  registerResumesRoutes(app, db);
  return app;
}

describe("resumes API", () => {
  it("updates resume label", async () => {
    const app = makeApp();
    const created = await request(app)
      .post("/api/v1/resumes")
      .send({
        filename: "resume.pdf",
        content_base64: Buffer.from("hello").toString("base64"),
        label: "Original",
      });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/v1/resumes/${created.body.id}`)
      .send({ label: "SWE March 2026" });
    expect(patched.status).toBe(200);
    expect(patched.body.label).toBe("SWE March 2026");

    const list = await request(app).get("/api/v1/resumes");
    expect(list.body.resumes[0].label).toBe("SWE March 2026");
  });
});
