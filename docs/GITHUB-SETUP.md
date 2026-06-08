# Publish Huntboard to GitHub

Your code is committed on branch **`main`**. Follow these steps once to create the public repo and push.

## Step 1 — Create an empty public repo on GitHub

1. Open [https://github.com/new](https://github.com/new)
2. **Repository name:** e.g. `huntboard` (or `job-application-tracker`)
3. **Visibility:** Public
4. **Do not** add a README, `.gitignore`, or license (you already have these locally)
5. Click **Create repository**

## Step 2 — Link your local repo to GitHub

Replace `YOUR_USER` and `REPO_NAME` with your GitHub username and repo name:

```powershell
cd C:\Users\nyuri\OneDrive\Documents\mybot

git remote add public https://github.com/YOUR_USER/REPO_NAME.git
```

Example:

```powershell
git remote add public https://github.com/Yurinodac/huntboard.git
```

Verify:

```powershell
git remote -v
```

## Step 3 — Pre-push check (recommended)

```powershell
powershell -File scripts/pre-push-check.ps1
```

Must show **PASSED** before pushing.

## Step 4 — Push

```powershell
git push -u public main
```

GitHub may ask you to sign in (browser or personal access token).

## Step 5 — Polish the repo page (resume)

On GitHub, open your new repo:

- **About** (gear icon): short description, e.g. *Local-first job application tracker with Gmail sync and optional AI*
- **Topics:** `typescript`, `react`, `nodejs`, `sqlite`, `gmail-api`
- Optional: add screenshots to `README.md` (use fake/demo data only)

## Ongoing workflow

When you update the app locally:

```powershell
git add .
git commit -m "describe your change"
powershell -File scripts/pre-push-check.ps1
git push public main
```

Your `.env` and `data/` folder are **never** pushed — they stay on your machine only.

## Optional: private backup remote

If you also want a private copy on GitHub:

1. Create a **Private** repo on GitHub (empty)
2. `git remote add origin https://github.com/YOUR_USER/huntboard-private.git`
3. `git push -u origin main`

Then `public` = resume showcase, `origin` = private backup.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `remote public already exists` | `git remote remove public` then add again |
| Authentication failed | Use [GitHub personal access token](https://github.com/settings/tokens) as password, or GitHub Desktop |
| Pushed wrong branch | `git push -u public main` (default branch should be `main`) |
