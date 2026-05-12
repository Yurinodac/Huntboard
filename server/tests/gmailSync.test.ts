import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { gmail_v1 } from "googleapis";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApplicationRepo } from "../src/db/applicationsRepo.js";
import { createLinksRepo } from "../src/db/linksRepo.js";
import { migrate } from "../src/db/migrate.js";
import { createOAuthRepo } from "../src/db/oauthRepo.js";
import { openDatabase } from "../src/db/pool.js";
import { registerApplicationsRoutes } from "../src/routes/applications.js";
import { registerGmailSyncRoutes } from "../src/routes/gmailSync.js";

function makeThreadDetail(from: string, subject: string, snippet: string) {
  return {
    data: {
      id: subject,
      snippet,
      messages: [
        {
          payload: {
            headers: [
              { name: "From", value: from },
              { name: "Subject", value: subject },
            ],
          },
        },
      ],
    },
  };
}

function makeFakeGmail(): gmail_v1.Gmail {
  return {
    users: {
      threads: {
        list: async () => ({
          data: {
            threads: [{ id: "t-match" }, { id: "t-low" }],
          },
        }),
        get: async ({ id }: { id?: string | null }) => {
          if (id === "t-match") {
            return makeThreadDetail(
              "Stripe Recruiting <jobs@stripe.com>",
              "Software engineer application update",
              "Thanks for applying to Stripe",
            );
          }
          return makeThreadDetail(
            "Newsletter <news@example.org>",
            "Weekly roundup",
            "Nothing about your role",
          );
        },
      },
    },
  } as unknown as gmail_v1.Gmail;
}

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-gsync-"));
  const db = openDatabase(path.join(dir, "x.db"));
  migrate(db);

  const app = express();
  app.use(express.json());
  registerApplicationsRoutes(app, db);
  registerGmailSyncRoutes(app, db, {
    gmailFactory: () => makeFakeGmail(),
    now: () => new Date("2026-05-11T12:00:00.000Z"),
  });

  return { app, db };
}

describe("gmail sync + link routes", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.OAUTH_REDIRECT_URI = "http://127.0.0.1:5179/oauth/callback";
    delete process.env.GMAIL_SYNC_DAYS;
    delete process.env.GMAIL_SYNC_MAX;
  });

  it("returns only scored suggestions from sync", async () => {
    const { app, db } = makeApp();
    const apps = createApplicationRepo(db);
    const oauth = createOAuthRepo(db);

    const row = apps.insert({
      company: "Stripe",
      title: "Software Engineer",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
    });
    expect(row).toBeTruthy();

    oauth.save({
      access_token: "token",
      refresh_token: "refresh",
      expiry_ms: Date.now() + 3600_000,
      scope: null,
      token_type: "Bearer",
    });

    const res = await request(app).post("/api/v1/gmail/sync").send({});
    expect(res.status).toBe(200);
    expect(res.body.synced_at).toBe("2026-05-11T12:00:00.000Z");
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].gmail_thread_id).toBe("t-match");
    expect(res.body.suggestions[0].application_id).toBe(row?.id);
    expect(res.body.suggestions[0].score).toBeGreaterThanOrEqual(25);
  });

  it("confirms links and returns conflict for duplicates", async () => {
    const { app, db } = makeApp();
    const apps = createApplicationRepo(db);
    const row = apps.insert({
      company: "Acme",
      title: "Engineer",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
    });
    expect(row).toBeTruthy();

    const first = await request(app).post("/api/v1/suggestions/confirm").send({
      application_id: row?.id,
      gmail_thread_id: "t-1",
    });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/v1/suggestions/confirm").send({
      application_id: row?.id,
      gmail_thread_id: "t-1",
    });
    expect(second.status).toBe(409);
  });

  it("lists placeholder threads when tokens are missing", async () => {
    const { app, db } = makeApp();
    const apps = createApplicationRepo(db);
    const links = createLinksRepo(db);
    const row = apps.insert({
      company: "Acme",
      title: "Engineer",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
    });
    expect(row).toBeTruthy();

    links.insert(row!.id, "t-placeholder");

    const res = await request(app).get(`/api/v1/applications/${row!.id}/threads`);
    expect(res.status).toBe(200);
    expect(res.body.threads).toEqual([
      {
        threadId: "t-placeholder",
        subject: null,
        snippet: null,
        fromDisplay: null,
        fromEmail: null,
        placeholder: true,
      },
    ]);
  });

  it("lists linked threads with gmail metadata when tokens exist", async () => {
    const { app, db } = makeApp();
    const apps = createApplicationRepo(db);
    const links = createLinksRepo(db);
    const oauth = createOAuthRepo(db);
    const row = apps.insert({
      company: "Stripe",
      title: "Software Engineer",
      status: "applied",
      work_arrangement: "unknown",
      file_links: [],
    });
    expect(row).toBeTruthy();

    links.insert(row!.id, "t-match");
    oauth.save({
      access_token: "token",
      refresh_token: "refresh",
      expiry_ms: Date.now() + 3600_000,
      scope: null,
      token_type: "Bearer",
    });

    const res = await request(app).get(`/api/v1/applications/${row!.id}/threads`);
    expect(res.status).toBe(200);
    expect(res.body.threads).toEqual([
      {
        threadId: "t-match",
        subject: "Software engineer application update",
        snippet: "Thanks for applying to Stripe",
        fromDisplay: "Stripe Recruiting",
        fromEmail: "jobs@stripe.com",
        placeholder: false,
      },
    ]);
  });
});
