# Job application tracker

Local-first tool to log job applications (SQLite), optionally connect **Gmail** (read-only), and review **suggested** links between threads and applications before you confirm them.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (includes `npm`)
- Windows: install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++** if `better-sqlite3` fails to compile during `npm install`

## Google Cloud setup (Gmail)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Gmail API**.
3. **OAuth consent screen**: External (or Internal for Workspace), add scope `https://www.googleapis.com/auth/gmail.readonly`, add yourself as a **Test user** while in Testing.
4. **Credentials** → Create **OAuth client ID**:
   - Type **Web application** (recommended for this app).
   - Authorized redirect URI: `http://127.0.0.1:5179/oauth/callback` (must match `OAUTH_REDIRECT_URI` and `PORT`).
5. Copy **Client ID** and **Client secret** into `.env` (see below).

## Install and run (development)

From the repository root:

```bash
npm install
copy .env.example .env   # Windows; or cp on macOS/Linux — then edit .env
```

Terminal 1 — API (listens on `http://127.0.0.1:5179` by default):

```bash
npm run dev
```

Terminal 2 — Web UI (Vite proxies `/api` and `/oauth` to the API):

```bash
npm run dev -w web
```

Or one command:

```bash
npm run dev:all
```

Open **http://127.0.0.1:5173**. Use **Applications** to log roles; use **Gmail** to connect, sync, and confirm suggestions.

## Production-style single server

Build the SPA and the server, then run the API with `NODE_ENV=production` so it also serves `web/dist`:

```bash
npm run build
npm start
```

Open **http://127.0.0.1:5179** (or your `PORT`). Set `FRONTEND_ORIGIN=http://127.0.0.1:5179` in `.env` so the OAuth callback redirect after Gmail login returns to this origin.

## Data

- SQLite file: `{DATA_DIR}/app.db` (default `./data/app.db` under the current working directory).
- OAuth tokens are stored in the database on this machine only.

## Tests

```bash
cd server
npm install
npm test
```

## Spec and plan

- Design: `docs/superpowers/specs/2026-05-11-job-application-tracker-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-11-job-application-tracker.md`
