# Job application tracker — design specification

**Date:** 2026-05-11  
**Status:** Approved for implementation planning (user confirmed 2026-05-11)

## 1. Purpose

Build a **local-first** tool that:

1. Lets the user **log and edit job applications** with structured details.
2. **Syncs with Gmail** (read-only) to find messages that may relate to those applications.
3. Proposes **email-to-application links**; the user **always confirms or rejects** suggestions before anything is stored as a confirmed link.
4. Runs on the **laptop the user always uses** (browser → `localhost`), so changing Wi-Fi networks does not affect access.

Out of scope for **v1**: hosted deployment, mobile-first UX, non-Gmail providers, **Claude/LLM integration** (documented as a future enhancement).

## 2. Constraints and assumptions

| Item | Decision |
|------|----------|
| Runtime | Local web app: browser UI + API server on the same machine |
| Primary device | Laptop carried between locations |
| Email | Gmail only (Google OAuth 2.0, Gmail API) |
| Linking policy | Heuristic **suggestions**; user **confirms**, **dismisses**, or **reassigns**; no automatic persistence of application↔thread links without confirmation |
| Application detail level | “Standard B” (see §4) |
| LLM | **Not in v1** |
| Data residency | SQLite and OAuth tokens on disk; no third-party analytics in v1 |

**Assumption:** The user can create a **Google Cloud project** and an **OAuth client** (installed/desktop or web with `http://127.0.0.1:<port>/oauth/callback`). For personal use, keeping the OAuth consent screen in **Testing** and adding the user as a test user is acceptable.

## 3. Recommended stack (v1)

- **Backend:** Node.js (Express or Fastify), REST API.
- **Frontend:** React + Vite SPA, served in dev by Vite and in production either static-from-API or same-origin proxy.
- **Database:** SQLite (e.g. `better-sqlite3` or equivalent), single file under a configurable `DATA_DIR` (default: `./data` relative to app root).
- **Gmail:** `googleapis` npm package; **scope:** `https://www.googleapis.com/auth/gmail.readonly` for v1.

Rationale: Strong documentation for Gmail OAuth in Node, fast iteration for UI, one process to run during development.

## 4. Data model

### 4.1 Application (`applications`)

| Field | Type | Notes |
|-------|------|--------|
| `id` | UUID or integer PK | |
| `company` | text | Required |
| `title` | text | Job title; required |
| `applied_date` | date | ISO date |
| `status` | enum | Controlled list (see §4.3) |
| `posting_url` | text | Optional URL |
| `notes` | text | Free-form |
| `location` | text | e.g. city, region, “US” |
| `work_arrangement` | enum | e.g. `remote`, `hybrid`, `onsite`, `unknown` |
| `salary_min` | nullable number | Optional |
| `salary_max` | nullable number | Optional; if only one number known, store in min or max with convention documented in code |
| `contact_name` | text | Optional |
| `contact_email` | text | Optional |
| `file_links` | JSON array of strings | URLs or `file://` paths as user-supplied strings; no file upload in v1 |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### 4.3 Application status enum (v1)

Suggested values (adjustable in migrations if needed): `interested`, `applied`, `recruiter_screen`, `interview`, `offer`, `rejected`, `withdrawn`, `archived`.

### 4.2 Gmail thread link (`application_thread_links`)

Stores **only user-confirmed** associations between an application and a Gmail thread.

| Field | Type | Notes |
|-------|------|--------|
| `id` | PK | |
| `application_id` | FK → applications | |
| `gmail_thread_id` | text | Gmail `threadId` |
| `confirmed_at` | datetime | |
| `created_at` | datetime | |

Unique constraint on (`application_id`, `gmail_thread_id`) to avoid duplicates.

### 4.4 Suggestions (ephemeral vs persisted)

**v1 behavior:** Suggestions are computed on each sync (or on demand) and returned to the UI; optionally cache in memory or short-lived table with TTL for UX. **Confirmed** links persist in `application_thread_links`. **Dismissed** pairs (application + thread) may be stored to avoid re-suggesting the same noise; if implemented, use table `dismissed_suggestions(application_id, gmail_thread_id, dismissed_at)` with unique (application_id, gmail_thread_id).

Minimum v1: no dismissed table (same suggestion may reappear until confirmed—acceptable if documented).

### 4.5 OAuth token storage (`oauth_tokens` or secure file)

Single row or encrypted JSON for: `access_token`, `refresh_token`, `expiry`, `scope`, `token_type`. **Implementation note:** Prefer OS keychain/credential manager when available; if v1 uses an encrypted file or plain env-backed file, document risk and migration path in README.

## 5. Gmail integration

### 5.1 OAuth flow

1. User clicks “Connect Gmail”.
2. Redirect to Google consent with redirect URI `http://127.0.0.1:<API_PORT>/oauth/callback` (or configured port).
3. Exchange code for tokens; persist refresh token securely.
4. UI shows “Connected” and last sync time.

### 5.2 Sync behavior

- **Trigger:** User-initiated “Check Gmail” (and optional periodic refresh later; v1 = manual only).
- **Query strategy:** Use Gmail `users.messages.list` with `q` combining:
  - recent window (e.g. `newer_than:30d` or configurable days), and/or
  - cursor: internal `historyId` or “last synced internal date” stored locally (implementation choice documented in code).
- **Read scope:** List + get message metadata and **snippet**; avoid storing full body unless needed for matching—prefer snippet + headers for v1 to reduce storage and PII surface.

### 5.3 Heuristic matching (suggestions)

Signals (non-exhaustive; implement with clear, testable functions):

- Normalized **company name** appears in `From` display name, `Subject`, or snippet.
- **Domain** match: extract domain from `posting_url` or `contact_email`; compare to `From` email domain (with caution for generic domains like `gmail.com`—lower weight or ignore).
- **Title** keywords overlap with subject/snippet (low weight).

Each suggestion includes: `application_id`, `gmail_thread_id`, `subject`, `from`, `snippet`, `score`, `reason_codes[]` (machine-readable for UI labels).

**No auto-insert** into `application_thread_links` without explicit user action.

### 5.4 User actions on suggestions

- **Confirm** → insert `application_thread_links`.
- **Dismiss** → optional `dismissed_suggestions` row (if implemented).
- **Reassign** → UI picks another `application_id` then Confirm.

## 6. API surface (illustrative)

REST JSON under `/api/v1`:

- `GET/POST /applications` — list, create  
- `GET/PATCH/DELETE /applications/:id` — read, update, delete  
- `POST /gmail/oauth/start` — return auth URL  
- `GET /oauth/callback` — Google redirect  
- `POST /gmail/sync` — run fetch + matching; returns suggestions + optional thread summaries for linked apps  
- `GET /applications/:id/threads` — confirmed threads + metadata from Gmail (on demand)  
- `POST /suggestions/:id/confirm` — body: `{ application_id, gmail_thread_id }` or use suggestion token from sync response  

Exact paths can vary; keep versioning and CORS limited to localhost in dev.

## 7. UI (v1)

- **Applications list:** sortable/filterable table; quick status filter.
- **Application detail / edit:** form for all Standard B fields.
- **Gmail panel:** connection status; “Check Gmail”; list of **pending suggestions** with Confirm / Dismiss / Reassign.
- **Per-application “Mail” tab:** threads from `application_thread_links`, read-only list with link to open in Gmail (deep link) where possible.

No Claude/LLM panels in v1.

## 8. Security and privacy

- API key for Gmail is **not** in frontend; only server holds client id/secret and tokens.
- CORS: restrict to `http://localhost` and `http://127.0.0.1` with app port.
- Log files must not log full email bodies or tokens.
- Document that **Gmail data is processed only on the laptop** for v1 (except Google’s own hosting of Gmail).

## 9. Errors

- **Token expired:** refresh automatically; if refresh fails, prompt user to reconnect.
- **Offline / Gmail API errors:** show last good local data; sync button disabled or retry with message.
- **Rate limits:** backoff and user-visible message.

## 10. Testing

- **Unit tests:** matching/scoring functions with fixture inputs (from/subject/snippet + application rows).
- **Integration tests:** API with Gmail client mocked; OAuth flow smoke-tested manually.

## 11. Future enhancements (non-v1)

- **Claude API (optional, user-triggered):** thread summary, “does this match?” assistant; API key only on server; never send full mailbox automatically.
- OS credential store for tokens.
- Dismissed-suggestions table always on.
- Additional email providers (Microsoft Graph, IMAP).
- Packaged desktop app (Tauri/Electron) with auto-start.

## 12. Success criteria (v1)

User can: add/edit applications; connect Gmail once; run sync; review suggestions; confirm correct thread links; see linked threads per application; disconnect or revoke from Google side without corrupting local application data.

---

## Spec self-review (2026-05-11)

- **Placeholders:** Salary single-value convention called out; dismissed table marked optional—explicit.
- **Consistency:** Stack, scope, and data model align; no Claude in v1.
- **Scope:** Single cohesive deliverable; future work listed separately.
- **Ambiguity resolved:** Suggestions are not auto-persisted; confirmed links are the source of truth for “related mail.”
