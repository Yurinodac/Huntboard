import path from "node:path";

/** Supports GOOGLE_CLIENT_ID or legacy CLIENT_ID from hand-edited .env files */
function oauthClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? process.env.CLIENT_ID ?? "";
}

function oauthClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? process.env.CLIENT_SECRET ?? "";
}

export const PORT = Number(process.env.PORT ?? 5179);
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
export const DATABASE_PATH = path.join(DATA_DIR, "app.db");

export const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";
export const GMAIL_SYNC_DAYS = Number(process.env.GMAIL_SYNC_DAYS ?? 30);
export const GMAIL_SYNC_MAX = Number(process.env.GMAIL_SYNC_MAX ?? 50);

/** OAuth: optional until user configures Gmail — validate only when Gmail routes run */
export function googleOAuthEnv() {
  return {
    clientId: oauthClientId(),
    clientSecret: oauthClientSecret(),
    redirectUri:
      process.env.OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${PORT}/oauth/callback`,
  };
}

/** Dated snapshot; override via CLAUDE_MODEL (e.g. claude-haiku-4-5 alias). */
export const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";

export function getClaudeApiKey(): string | undefined {
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  return key?.trim() || undefined;
}

export function isClaudeEnabled(): boolean {
  return Boolean(getClaudeApiKey());
}

export function assertGoogleOAuthConfigured() {
  const { clientId, clientSecret } = googleOAuthEnv();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Gmail connection",
    );
  }
}
