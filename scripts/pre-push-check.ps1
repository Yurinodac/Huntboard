# Huntboard pre-push safety check (run from repo root)
# Usage: powershell -File scripts/pre-push-check.ps1

$ErrorActionPreference = "Stop"
$failed = $false

function Fail($msg) {
    Write-Host "FAIL: $msg" -ForegroundColor Red
    $script:failed = $true
}

function Pass($msg) {
    Write-Host "PASS: $msg" -ForegroundColor Green
}

function Warn($msg) {
    Write-Host "WARN: $msg" -ForegroundColor Yellow
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "`n=== Huntboard pre-push check ===`n" -ForegroundColor Cyan

# 1. Private files must not be staged
$staged = git diff --cached --name-only
$blockedPatterns = @('^\.env$', '^data/', '/data/', '\.db$', 'credentials', 'secret', 'token\.json')
foreach ($file in $staged) {
    foreach ($pat in $blockedPatterns) {
        if ($file -match $pat) {
            Fail "Staged sensitive path: $file"
        }
    }
}
if (-not ($staged | Where-Object { $_ -match '^\.env$|^data/|\.db$' })) {
    Pass "No staged .env, data/, or .db files"
}

# 2. Private files must not be tracked
$tracked = git ls-files
$sensitiveTracked = $tracked | Where-Object {
    $_ -eq '.env' -or $_ -match '^data/' -or $_ -match '\.db$' -or $_ -match 'credentials\.json'
}
if ($sensitiveTracked) {
    foreach ($t in $sensitiveTracked) { Fail "Tracked sensitive file: $t" }
} else {
    Pass "No .env, data/, or .db files in git index"
}

# 3. .env should be ignored locally
if (Test-Path '.env') {
    $ignoreLine = git check-ignore -v .env 2>$null
    if ($ignoreLine) { Pass ".env exists locally and is gitignored" }
    else { Fail ".env exists but is NOT gitignored - update .gitignore before pushing" }
} else {
    Warn ".env not found locally (fine for CI; you need it to run the app)"
}

# 4. .env.example must not contain real secrets
if (Test-Path '.env.example') {
    $example = Get-Content '.env.example' -Raw
    if ($example -match '(?m)^(ANTHROPIC_API_KEY|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID|CLAUDE_API_KEY)=\S+') {
        Fail ".env.example contains non-empty secret values"
    } else {
        Pass ".env.example has empty secret placeholders"
    }
}

# 5. Scan tracked source for common secret patterns
$patterns = @('sk-ant-', 'ghp_', 'gho_', 'AIzaSy', 'BEGIN RSA PRIVATE KEY', 'BEGIN OPENSSH PRIVATE KEY')
$hits = @()
foreach ($file in $tracked) {
    if ($file -match '\.(png|jpg|jpeg|gif|webp|ico|pdf|db|sqlite)$') { continue }
    $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    foreach ($pat in $patterns) {
        if ($content -match [regex]::Escape($pat)) {
            $hits += "$file ($pat)"
        }
    }
}
if ($hits.Count -gt 0) {
    foreach ($h in $hits) { Fail "Possible secret in tracked file: $h" }
} else {
    Pass "No common API key patterns in tracked files"
}

# 6. History scan for .env ever committed
$envHistory = git log --all --oneline -- .env 2>$null
if ($envHistory) {
    Fail ".env appears in git history - rewrite history before a public push"
} else {
    Pass ".env never committed"
}

# 7. Optional: run tests
Write-Host "`nRunning server tests..." -ForegroundColor Cyan
Push-Location server
npm test --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "Server tests failed (npm test in server/)"
} else {
    Pass "Server tests passed"
}
Pop-Location

Write-Host ""
if ($failed) {
    Write-Host "Pre-push check FAILED. Fix issues above before pushing to a public repo.`n" -ForegroundColor Red
    exit 1
}

Write-Host "Pre-push check PASSED. Safe to push source code (not .env or data/).`n" -ForegroundColor Green
Write-Host "Reminder: commit author email is visible on GitHub. See docs/PRE-PUSH-CHECKLIST.md`n"
exit 0
