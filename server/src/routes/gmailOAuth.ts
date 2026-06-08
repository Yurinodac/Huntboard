import type { Express } from "express";
import type Database from "better-sqlite3";
import { google } from "googleapis";
import {
  assertGoogleOAuthConfigured,
  FRONTEND_ORIGIN,
  googleOAuthEnv,
  PORT,
} from "../config.js";
import { createOAuthRepo } from "../db/oauthRepo.js";

const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

function gmailPanelUrl(query: string): string {
  if (process.env.NODE_ENV === "production") {
    return `http://127.0.0.1:${PORT}/gmail${query}`;
  }
  return `${FRONTEND_ORIGIN}/gmail${query}`;
}

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
      res.redirect(gmailPanelUrl("?gmail=error&reason=missing_code"));
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
      res.redirect(gmailPanelUrl("?gmail=connected"));
    } catch (err) {
      const message = encodeURIComponent(
        err instanceof Error ? err.message : String(err),
      );
      res.redirect(gmailPanelUrl(`?gmail=error&reason=${message}`));
    }
  });
}
