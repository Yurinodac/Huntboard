import path from "node:path";

export const PORT = Number(process.env.PORT ?? 5179);
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
export const DATABASE_PATH = path.join(DATA_DIR, "app.db");

export const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";

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
