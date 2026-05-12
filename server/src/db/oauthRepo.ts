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
        .prepare(
          `SELECT access_token, refresh_token, expiry_ms, scope, token_type FROM oauth_tokens WHERE id = 1`,
        )
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
