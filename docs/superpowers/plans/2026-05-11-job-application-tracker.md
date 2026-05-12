# Job application tracker — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local-first job application tracker with SQLite persistence, Gmail OAuth + read-only sync, heuristic match suggestions with user confirmation, and a React UI usable at `http://localhost`.

**Architecture:** An Express REST API (`server/`) owns SQLite, OAuth tokens, and Gmail API calls; a Vite React SPA (`web/`) calls the API via relative `/api` proxy in dev and production static-from-server pattern. Matching logic lives in pure functions (`server/src/matching/`) tested without network.

**Tech Stack:** Node 20+, TypeScript, Express 4, better-sqlite3, googleapis, zod (validation), Vitest (server tests), React 18, Vite 6, TanStack Query optional or fetch wrapper.

---

## File structure (created or modified)

| Path | Responsibility |
|------|----------------|
| `package.json` (root) | npm workspaces `server`, `web`; scripts `dev`, `build`, `test` |
| `server/package.json` | Backend deps and `npm run dev` for API only |
| `server/tsconfig.json` | Strict TS for Node |
| `server/src/index.ts` | Express app, CORS localhost-only, mount routes, static `web/dist` in prod |
| `server/src/config.ts` | `PORT`, `DATA_DIR`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` from env |
| `server/src/db/migrate.ts` | Run DDL once at startup |
| `server/src/db/pool.ts` | Single better-sqlite3 `Database` instance |
| `server/src/db/applicationsRepo.ts` | CRUD + list filters |
| `server/src/db/linksRepo.ts` | Confirmed thread links |
| `server/src/db/oauthRepo.ts` | Single-row token table |
| `server/src/db/syncStateRepo.ts` | Optional `last_sync_at`, query window |
| `server/src/matching/scoreThread.ts` | Pure scoring: application row + thread meta → score + reason_codes |
| `server/src/gmail/service.ts` | listRecentThreads, getThreadMeta; accepts injected `gmail` client for tests |
| `server/src/routes/applications.ts` | REST `/api/v1/applications` |
| `server/src/routes/gmail.ts` | OAuth start/callback, `/sync`, confirm |
| `server/src/types/application.ts` | Zod schemas + TS types |
| `server/src/types/suggestions.ts` | Suggestion DTO |
| `server/vitest.config.ts` | Vitest node environment |
| `server/tests/matching.test.ts` | Fixtures → scores |
| `server/tests/applications.test.ts` | Supertest against app with temp SQLite |
| `web/package.json` | Frontend deps |
| `web/vite.config.ts` | Proxy `/api` → `http://127.0.0.1:${SERVER_PORT}` |
| `web/index.html` | SPA shell |
| `web/src/main.tsx` | React root |
| `web/src/App.tsx` | Router layout: list / detail / gmail panel |
| `web/src/api/client.ts` | `fetch` wrappers |
| `web/src/pages/ApplicationsList.tsx` | Table + status filter |
| `web/src/pages/ApplicationDetail.tsx` | Form Standard B + Mail tab |
| `web/src/pages/GmailPanel.tsx` | Connect, sync, suggestions |
| `.env.example` | Document required vars (no secrets) |
| `README.md` | Run instructions, Google Cloud OAuth setup, DATA_DIR |

---

### Task 1: Root workspace and server skeleton

**Files:**
- Create: `package.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "job-tracker",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "npm run dev -w server"
  }
}
```

- [ ] **Step 2: Create `server/package.json`**

```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "googleapis": "^144.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.5",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 3: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `server/src/config.ts`**

```typescript
import path from "node:path";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const PORT = Number(process.env.PORT ?? 5179);
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
export const DATABASE_PATH = path.join(DATA_DIR, "app.db");

/** OAuth: optional until user configures Gmail — validate only when Gmail routes run */
export function googleOAuthEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${PORT}/oauth/callback`,
  };
}

export function assertGoogleOAuthConfigured() {
  const { clientId, clientSecret } = googleOAuthEnv();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Gmail connection",
    );
  }
}
```

- [ ] **Step 5: Create minimal `server/src/index.ts`**

```typescript
import cors from "cors";
import express from "express";
import { PORT } from "./config.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
    credentials: true,
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 6: Install and verify**

Run from repo root:

```bash
cd server && npm install && npm run dev
```

Expected: console prints `API http://127.0.0.1:5179` (or PORT).

Run in another terminal:

```bash
curl -s http://127.0.0.1:5179/health
```

Expected: `{"ok":true}`

- [ ] **Step 7: Commit**

```bash
git add package.json server/package.json server/tsconfig.json server/src/config.ts server/src/index.ts server/package-lock.json
git commit -m "chore: scaffold Express server and workspace root"
```

---

### Task 2: SQLite schema and migrations

**Files:**
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/pool.ts`
- Modify: `server/src/index.ts` — call migrate on startup after mkdir DATA_DIR

- [ ] **Step 1: Write failing test that DB file exists after migrate**

Create `server/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Create `server/tests/migrate.test.ts`:

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";

describe("migrate", () => {
  it("creates applications table", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-"));
    const dbPath = path.join(dir, "t.db");
    const db = openDatabase(dbPath);
    migrate(db);
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
      )
      .get();
    expect(row).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:

```bash
cd server && npm install && npx vitest run tests/migrate.test.ts
```

Expected: FAIL — module not found or migrate missing.

- [ ] **Step 3: Implement `server/src/db/pool.ts`**

```typescript
import Database from "better-sqlite3";

export function openDatabase(filePath: string): Database.Database {
  return new Database(filePath);
}
```

- [ ] **Step 4: Implement `server/src/db/migrate.ts`**

```typescript
import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      applied_date TEXT,
      status TEXT NOT NULL,
      posting_url TEXT,
      notes TEXT,
      location TEXT,
      work_arrangement TEXT NOT NULL DEFAULT 'unknown',
      salary_min REAL,
      salary_max REAL,
      contact_name TEXT,
      contact_email TEXT,
      file_links TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_thread_links (
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL,
      gmail_thread_id TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(application_id, gmail_thread_id),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT,
      refresh_token TEXT,
      expiry_ms INTEGER,
      scope TEXT,
      token_type TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_links_app ON application_thread_links(application_id);
  `);
}
```

- [ ] **Step 5: Wire startup in `server/src/index.ts`** — after imports add:

```typescript
import fs from "node:fs";
import { DATABASE_PATH, DATA_DIR } from "./config.js";
import { migrate } from "./db/migrate.js";
import { openDatabase } from "./db/pool.js";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDatabase(DATABASE_PATH);
migrate(db);
```

Export `db` from a small `server/src/db/index.ts` if you prefer singleton; for tests use inject pattern later.

- [ ] **Step 6: Run vitest**

Run:

```bash
cd server && npx vitest run tests/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/vitest.config.ts server/tests/migrate.test.ts server/src/db/pool.ts server/src/db/migrate.ts server/src/index.ts
git commit -m "feat(db): add SQLite schema and migration"
```

---

### Task 3: Applications repository and REST CRUD

**Files:**
- Create: `server/src/types/application.ts`
- Create: `server/src/db/applicationsRepo.ts`
- Create: `server/src/routes/applications.ts`
- Modify: `server/src/index.ts` — mount router; pass `db`

- [ ] **Step 1: Define Zod schema and types `server/src/types/application.ts`**

```typescript
import { z } from "zod";

export const ApplicationStatus = z.enum([
  "interested",
  "applied",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
]);

export const WorkArrangement = z.enum(["remote", "hybrid", "onsite", "unknown"]);

export const ApplicationCreate = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  applied_date: z.string().optional(),
  status: ApplicationStatus,
  posting_url: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  location: z.string().optional(),
  work_arrangement: WorkArrangement.default("unknown"),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  file_links: z.array(z.string()).default([]),
});

export const ApplicationPatch = ApplicationCreate.partial();

export type ApplicationCreate = z.infer<typeof ApplicationCreate>;
export type ApplicationRecord = ApplicationCreate & {
  id: string;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Implement `server/src/db/applicationsRepo.ts`**

```typescript
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { ApplicationCreate, ApplicationPatch } from "../types/application.js";

function nowIso() {
  return new Date().toISOString();
}

export function createApplicationRepo(db: Database.Database) {
  return {
    list(status?: string) {
      if (status) {
        return db
          .prepare(
            `SELECT * FROM applications WHERE status = ? ORDER BY applied_date DESC, updated_at DESC`,
          )
          .all(status);
      }
      return db
        .prepare(`SELECT * FROM applications ORDER BY applied_date DESC, updated_at DESC`)
        .all();
    },
    get(id: string) {
      return db.prepare(`SELECT * FROM applications WHERE id = ?`).get(id);
    },
    insert(row: ApplicationCreate) {
      const id = crypto.randomUUID();
      const ts = nowIso();
      const file_links = JSON.stringify(row.file_links ?? []);
      db.prepare(
        `INSERT INTO applications (
          id, company, title, applied_date, status, posting_url, notes, location,
          work_arrangement, salary_min, salary_max, contact_name, contact_email,
          file_links, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        row.company,
        row.title,
        row.applied_date ?? null,
        row.status,
        row.posting_url || null,
        row.notes ?? null,
        row.location ?? null,
        row.work_arrangement,
        row.salary_min ?? null,
        row.salary_max ?? null,
        row.contact_name ?? null,
        row.contact_email || null,
        file_links,
        ts,
        ts,
      );
      return this.get(id);
    },
    update(id: string, patch: ApplicationPatch) {
      const cur = this.get(id) as Record<string, unknown> | undefined;
      if (!cur) return undefined;
      const next = { ...cur, ...patch, file_links: patch.file_links ?? cur.file_links };
      const updated = nowIso();
      db.prepare(
        `UPDATE applications SET
          company=@company, title=@title, applied_date=@applied_date, status=@status,
          posting_url=@posting_url, notes=@notes, location=@location,
          work_arrangement=@work_arrangement, salary_min=@salary_min, salary_max=@salary_max,
          contact_name=@contact_name, contact_email=@contact_email, file_links=@file_links,
          updated_at=@updated_at
        WHERE id=@id`,
      ).run({
        ...next,
        file_links:
          typeof next.file_links === "string"
            ? next.file_links
            : JSON.stringify(next.file_links ?? []),
        updated_at: updated,
        id,
      });
      return this.get(id);
    },
    delete(id: string) {
      db.prepare(`DELETE FROM applications WHERE id = ?`).run(id);
    },
  };
}
```

- [ ] **Step 3: Implement routes `server/src/routes/applications.ts`**

```typescript
import type { Express } from "express";
import type Database from "better-sqlite3";
import { ApplicationCreate, ApplicationPatch } from "../types/application.js";
import { createApplicationRepo } from "../db/applicationsRepo.js";

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
```

- [ ] **Step 4: Mount in `server/src/index.ts`**

```typescript
import { registerApplicationsRoutes } from "./routes/applications.js";
// after db + migrate:
registerApplicationsRoutes(app, db);
```

- [ ] **Step 5: Integration test `server/tests/applications.test.ts`**

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import { openDatabase } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
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
    const list = await request(app).get("/api/v1/applications");
    expect(list.body.length).toBe(1);
    expect(list.body[0].company).toBe("Acme");
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd server && npx vitest run tests/applications.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/types/application.ts server/src/db/applicationsRepo.ts server/src/routes/applications.ts server/tests/applications.test.ts server/src/index.ts
git commit -m "feat(api): applications CRUD"
```

---

### Task 4: OAuth token storage and Gmail OAuth routes

**Files:**
- Create: `server/src/db/oauthRepo.ts`
- Create: `server/src/routes/gmailOAuth.ts`
- Modify: `server/src/config.ts` — add `FRONTEND_ORIGIN` (optional) next to existing exports
- Modify: `server/src/index.ts` — `registerGmailOAuthRoutes(app, db)`

`GET /api/v1/gmail/oauth/start` returns JSON `{ authUrl }` using `google.auth.OAuth2` with scope `https://www.googleapis.com/auth/gmail.readonly`, `prompt: "consent"`, `access_type: "offline"`.  
`GET /oauth/callback` exchanges `code`, saves tokens, redirects to `${FRONTEND_ORIGIN}/?gmail=connected` (default `FRONTEND_ORIGIN=http://127.0.0.1:5173`).

- [ ] **Step 1: Extend `server/src/config.ts`** — append:

```typescript
export const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";
```

- [ ] **Step 2: Create `server/src/db/oauthRepo.ts`**

```typescript
import type Database from "better-sqlite3";

export type StoredTokens = {
  access_token: string | null;
  refresh_token: string | null;
  expiry_ms: number | null;
  scope: string | null;
  token_type: string | null;
};

export function createOAuthRepo(db: Database.Database) {
  return {
    get(): StoredTokens | undefined {
      const row = db
        .prepare(`SELECT access_token, refresh_token, expiry_ms, scope, token_type FROM oauth_tokens WHERE id = 1`)
        .get() as StoredTokens | undefined;
      return row;
    },
    save(t: StoredTokens) {
      const ts = new Date().toISOString();
      db.prepare(
        `INSERT INTO oauth_tokens (id, access_token, refresh_token, expiry_ms, scope, token_type, updated_at)
         VALUES (1,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
           expiry_ms = excluded.expiry_ms,
           scope = excluded.scope,
           token_type = excluded.token_type,
           updated_at = excluded.updated_at`,
      ).run(
        t.access_token,
        t.refresh_token,
        t.expiry_ms,
        t.scope,
        t.token_type,
        ts,
      );
    },
  };
}
```

- [ ] **Step 3: Create `server/src/routes/gmailOAuth.ts`**

```typescript
import type { Express } from "express";
import type Database from "better-sqlite3";
import { google } from "googleapis";
import { assertGoogleOAuthConfigured, FRONTEND_ORIGIN, googleOAuthEnv } from "../config.js";
import { createOAuthRepo } from "../db/oauthRepo.js";

const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

function makeOAuth2() {
  assertGoogleOAuthConfigured();
  const { clientId, clientSecret, redirectUri } = googleOAuthEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function registerGmailOAuthRoutes(app: Express, db: Database.Database) {
  const oauthRepo = createOAuthRepo(db);

  app.get("/api/v1/gmail/oauth/start", (_req, res) => {
    try {
      const oauth2 = makeOAuth2();
      const authUrl = oauth2.generateAuthUrl({
        access_type: "offline",
        scope: [GMAIL_READONLY],
        prompt: "consent",
      });
      res.json({ authUrl });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    if (!code) {
      res.status(400).send("missing ?code=");
      return;
    }
    try {
      const oauth2 = makeOAuth2();
      const { tokens } = await oauth2.getToken(code);
      oauthRepo.save({
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ?? null,
        expiry_ms: tokens.expiry_date ?? null,
        scope: tokens.scope ?? null,
        token_type: tokens.token_type ?? null,
      });
      res.redirect(`${FRONTEND_ORIGIN}/?gmail=connected`);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : String(err));
    }
  });
}
```

- [ ] **Step 4: Register routes in `server/src/index.ts`**

```typescript
import { registerGmailOAuthRoutes } from "./routes/gmailOAuth.js";
// after db exists:
registerGmailOAuthRoutes(app, db);
```

- [ ] **Step 5: Manual smoke** — Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI=http://127.0.0.1:5179/oauth/callback` (match `PORT`). In Google Cloud Console add that redirect URI. Run server, `curl -s http://127.0.0.1:5179/api/v1/gmail/oauth/start`, open `authUrl` in browser, complete consent; confirm redirect hits Vite `5173` and `oauth_tokens` row exists (DB browser or temporary GET `/api/v1/gmail/status` once Task 10 adds it).

- [ ] **Step 6: Commit**

```bash
git add server/src/db/oauthRepo.ts server/src/routes/gmailOAuth.ts server/src/config.ts server/src/index.ts
git commit -m "feat(auth): Gmail OAuth storage and callback"
```

---

### Task 5: Matching engine (TDD)

**Files:**
- Create: `server/src/matching/scoreThread.ts`
- Create: `server/tests/matching.test.ts`

Scoring rules (concrete):

- Normalize strings: lowercase, strip punctuation, collapse spaces.
- **company_match** (+40): application.company normalized appears in `fromDisplay`, `subject`, or `snippet`.
- **domain_match** (+35): host from `posting_url` or `contact_email` equals sender domain; skip if domain in `gmail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, `icloud.com`.
- **title_keyword** (+15 max): count overlapping significant words (length ≥ 4) between job title and subject+snippet; add `min(15, overlap * 5)`.

Total score = sum, cap at 100. `reason_codes` array lists which fired.

- [ ] **Step 1: Write `server/tests/matching.test.ts`** with fixtures:

```typescript
import { describe, expect, it } from "vitest";
import { scoreThreadAgainstApplication } from "../src/matching/scoreThread.js";

const baseApp = {
  id: "a1",
  company: "Stripe",
  title: "Software Engineer",
  posting_url: "https://stripe.com/jobs/123",
  contact_email: "jobs@stripe.com",
};

describe("scoreThreadAgainstApplication", () => {
  it("scores domain + company", () => {
    const r = scoreThreadAgainstApplication(baseApp, {
      threadId: "t1",
      fromDisplay: "Stripe Recruiting",
      fromEmail: "no-reply@stripe.com",
      subject: "Update on your application",
      snippet: "Thank you for applying",
    });
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.reason_codes).toContain("company_match");
    expect(r.reason_codes).toContain("domain_match");
  });

  it("ignores generic email domain", () => {
    const r = scoreThreadAgainstApplication(
      { ...baseApp, posting_url: "", contact_email: "me@gmail.com" },
      {
        threadId: "t2",
        fromDisplay: "Bob",
        fromEmail: "bob@gmail.com",
        subject: "Hello",
        snippet: "Hi",
      },
    );
    expect(r.reason_codes).not.toContain("domain_match");
  });
});
```

- [ ] **Step 2: Implement `scoreThreadAgainstApplication`** returning `{ score, reason_codes, application_id }`.

- [ ] **Step 3: Run vitest** — PASS.

- [ ] **Step 4: Commit** — `feat(matching): heuristic thread scoring`

---

### Task 6: Gmail sync endpoint

**Files:**
- Create: `server/src/gmail/service.ts`
- Create: `server/src/routes/gmailSync.ts`
- Modify: `server/src/index.ts`

Behavior:

- Load OAuth tokens; refresh if expired (`oauth2Client.refreshAccessToken`).
- `users.messages.list` with `q: 'newer_than:30d'` (constant `GMAIL_SYNC_DAYS` env default 30), `maxResults: 50`.
- For each message id, `users.messages.get` with `format: 'metadata'` and `metadataHeaders: ['From','Subject']` to build thread list — **dedupe by threadId** using `threads.users.threads.get` or collect thread ids from messages (use `threads.list` if simpler: `users.threads.list` with same query).
- For each unique thread, compute best-scoring application per thread; if score ≥ 25, emit suggestion unless `(application_id, thread_id)` already in `application_thread_links`.

Response JSON:

```json
{
  "suggestions": [
    {
      "application_id": "...",
      "gmail_thread_id": "...",
      "subject": "...",
      "from": "...",
      "snippet": "...",
      "score": 75,
      "reason_codes": ["company_match", "domain_match"]
    }
  ],
  "synced_at": "2026-05-11T12:00:00.000Z"
}
```

- [ ] **Step 1: Implement Gmail list with injected client** — export `fetchRecentThreads(oauth2Client)` for tests.

- [ ] **Step 2: Mock Gmail in test** — `server/tests/gmailSync.test.ts` injects fake `list`/`get` returning two threads; assert suggestions length.

- [ ] **Step 3: `POST /api/v1/gmail/sync`** — requires valid tokens.

- [ ] **Step 4: Commit** — `feat(gmail): sync and suggestion generation`

---

### Task 7: Confirm links and list threads per application

**Files:**
- Create: `server/src/db/linksRepo.ts`
- Add routes: `POST /api/v1/suggestions/confirm` body `{ application_id, gmail_thread_id }`
- Add: `GET /api/v1/applications/:id/threads` — returns linked threads + Gmail metadata (fetch thread via API)

- [ ] **Step 1: Implement `linksRepo` insert with unique constraint handling** — return 409 if duplicate.

- [ ] **Step 2: Wire confirm endpoint**.

- [ ] **Step 3: Integration test** with mocked Gmail for GET threads.

- [ ] **Step 4: Commit** — `feat(api): confirm thread links and list mail`

---

### Task 8: Web app scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/vite-env.d.ts`

**web/vite.config.ts** proxy:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5179",
      "/oauth": "http://127.0.0.1:5179",
    },
  },
});
```

Note: Express must expose OAuth at `/oauth/callback` or proxy path adjusted — align callback URL with Google Cloud console.

- [ ] **Step 1: `npm create vite@latest web -- --template react-ts`** or match files above.

- [ ] **Step 2: Root `package.json` script `"dev": "concurrently \"npm run dev -w server\" \"npm run dev -w web\""` after adding `concurrently` devDependency **or** document two terminals.

- [ ] **Step 3: Commit** — `chore(web): Vite React scaffold and API proxy`

---

### Task 9: UI — applications list and detail

**Files:**
- Create: `web/src/api/client.ts`
- Create: `web/src/pages/ApplicationsList.tsx`
- Create: `web/src/pages/ApplicationDetail.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: `client.ts`** — `getApplications`, `createApplication`, `patchApplication`, base URL `''` (same origin via proxy).

- [ ] **Step 2: List page** — table with columns company, title, status, applied_date; filter dropdown by status.

- [ ] **Step 3: Detail page** — controlled form for all Standard B fields; `file_links` as newline-separated URLs in textarea, split on save.

- [ ] **Step 4: Commit** — `feat(ui): applications list and edit form`

---

### Task 10: UI — Gmail panel

**Files:**
- Create: `web/src/pages/GmailPanel.tsx`

- [ ] **Step 1:** Show connection state via `GET /api/v1/gmail/status` (add small endpoint returning `{ connected: boolean, last_sync_at?: string }` from `sync_state` + token presence).

- [ ] **Step 2:** Button “Connect Gmail” → window.location = `authUrl` from `/api/v1/gmail/oauth/start`.

- [ ] **Step 3:** “Check Gmail” → POST sync; render suggestions with Confirm (calls confirm API), Dismiss (client-side remove from list only in v1).

- [ ] **Step 4:** Application detail “Mail” tab: GET `/api/v1/applications/:id/threads`.

- [ ] **Step 5: Commit** — `feat(ui): Gmail connection, sync, suggestions, mail tab`

---

### Task 11: Documentation and production single-command

**Files:**
- Create: `.env.example`
- Create: `README.md`
- Modify: `server/src/index.ts` — in production `NODE_ENV=production`, `express.static` serve `../web/dist`

- [ ] **Step 1: `.env.example`**

```
PORT=5179
DATA_DIR=./data
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_REDIRECT_URI=http://127.0.0.1:5179/oauth/callback
```

Align ports with Vite vs unified server strategy in README.

- [ ] **Step 2: README** — Google Cloud OAuth setup (Desktop vs Web), redirect URIs, test users, `gmail.readonly` scope.

- [ ] **Step 3: Root script `build`** — `npm run build -w web && npm run build -w server`.

- [ ] **Step 4: Commit** — `docs: README and env example`

---

## Spec coverage checklist

| Spec section | Task(s) |
|--------------|---------|
| §3 Stack | Task 1, 8 |
| §4 Data model | Task 2, 3, 7 |
| §5 Gmail OAuth | Task 4 |
| §5 Sync + matching | Task 5, 6 |
| §5 Confirm actions | Task 7 |
| §6 API | Tasks 3–7 |
| §7 UI | Tasks 9–10 |
| §8 Security CORS | Task 1 |
| §9 Errors | Implement in routes (token refresh in Task 4/6) |
| §10 Testing | Tasks 2, 3, 5, 6 |

## Plan self-review

- **Gaps addressed:** Added explicit `/api/v1/gmail/status` for UI (spec implied); Task 10 documents it.
- **Placeholder scan:** Task 4 includes full `oauthRepo` and `gmailOAuth` route source (no omitted implementations).
- **Type consistency:** Application fields match migration column names; `file_links` stored as JSON string in DB.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-job-application-tracker.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
