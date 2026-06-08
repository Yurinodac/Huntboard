# Pre-push checklist (public GitHub / resume)

Use this before the **first** public push and again whenever you add features or touch config.

## Quick run

From the repo root:

```powershell
powershell -File scripts/pre-push-check.ps1
```

All checks should pass before `git push` to a **public** remote.

---

## Audit results (2026-06-04)

| Check | Result |
|-------|--------|
| `.env` in git history | **Pass** — never committed |
| `data/` or `app.db` in git history | **Pass** — never committed |
| `.env` gitignored locally | **Pass** |
| `.env.example` has empty secrets | **Pass** |
| API key patterns in tracked files | **Pass** |
| API key patterns in git history | **Pass** |
| Server tests (`npm test` in `server/`) | **Pass** (44 tests) |

Your repo is in good shape for a public **source-code** push. Private runtime data (`.env`, SQLite, resume PDFs) stays local via `.gitignore`.

---

## 1. Secrets and private data (must pass)

- [ ] **`.env` is not staged or tracked**  
  Should only exist on your machine. Verified ignored by `.gitignore`.

- [ ] **`data/` is not staged or tracked**  
  Holds `app.db`, Gmail OAuth tokens, and `resumes/` PDFs.

- [ ] **`.env.example` has empty values** for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`.

- [ ] **No real keys in source, README, or docs**  
  Search before push:
  ```powershell
  git grep -i "sk-ant-\|ghp_\|gho_\|AIzaSy" $(git rev-list --all)
  ```
  (Should return nothing.)

- [ ] **Never `git add -f .env` or `git add -f data/`**  
  Force-add bypasses `.gitignore`.

---

## 2. Git history (first public push only)

- [ ] **`.env` was never committed**  
  ```powershell
  git log --all --oneline -- .env
  ```
  (Should be empty.)

- [ ] **`data/` was never committed**  
  ```powershell
  git log --all --oneline -- data/
  ```

If either shows commits, do **not** push as-is. Options: new repo with a clean initial commit, or rewrite history (`git filter-repo`).

---

## 3. Personal info in commits (awareness)

Git commit **author email** is public on GitHub. Current commits use your Illinois address (`ychen526@illinois.edu`). That is normal for a portfolio repo; if you prefer privacy, use GitHub’s noreply email on **future** commits (GitHub → Settings → Emails).

Test data uses fake companies (Stripe, Acme Corp) — safe to publish.

---

## 4. Code quality (recommended)

- [ ] **Tests pass**
  ```powershell
  cd server
  npm test
  ```

- [ ] **README is portfolio-ready** — features, stack, setup steps, no personal job data or screenshots of real applications.

- [ ] **Uncommitted work** — commit or stash before pushing; your branch currently has many local changes not yet committed.

---

## 5. Two-remotes workflow (personal use + public showcase)

Keep using this folder with real `.env` and `data/`. Push **only git-tracked files** to a public repo:

```powershell
# One-time: create empty public repo on GitHub, then:
git remote add public https://github.com/YOUR_USER/huntboard.git

# After commit:
git push -u public feat/job-application-tracker
# or merge to main first, then: git push -u public main
```

Optional private backup:

```powershell
git remote add origin https://github.com/YOUR_USER/huntboard-private.git
git push -u origin main
```

`.env` and `data/` never leave your PC — both remotes get the same source code only.

---

## 6. After first public push

- [ ] Repo visibility is **Public** (intentional for resume).
- [ ] Add a short **About** description and topics on GitHub (typescript, react, node, sqlite, gmail-api).
- [ ] Consider **screenshots with fake data** in the README.
- [ ] Do **not** deploy your personal instance with your real Gmail/DB unless you use a separate demo environment.

---

## What stays local forever

| Item | Location |
|------|----------|
| API keys | `.env` |
| Job applications | `data/app.db` |
| Gmail tokens | inside `app.db` |
| Resume PDFs | `data/resumes/` |

These are excluded by `.gitignore` (`data/`, `.env`, and `*.db`).
