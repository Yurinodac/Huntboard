import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";

type LinkRow = {
  id: string;
  application_id: string;
  gmail_thread_id: string;
  confirmed_at: string;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function createLinksRepo(db: DB) {
  return {
    insert(application_id: string, gmail_thread_id: string): LinkRow {
      const row: LinkRow = {
        id: crypto.randomUUID(),
        application_id,
        gmail_thread_id,
        confirmed_at: nowIso(),
        created_at: nowIso(),
      };
      try {
        db.prepare(
          `INSERT INTO application_thread_links (
            id, application_id, gmail_thread_id, confirmed_at, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.application_id,
          row.gmail_thread_id,
          row.confirmed_at,
          row.created_at,
        );
      } catch (err) {
        if (
          err instanceof Database.SqliteError &&
          err.code === "SQLITE_CONSTRAINT_UNIQUE"
        ) {
          throw Object.assign(new Error("link already exists"), { status: 409 });
        }
        throw err;
      }
      return row;
    },
    listByApplication(application_id: string): LinkRow[] {
      return db
        .prepare(
          `SELECT id, application_id, gmail_thread_id, confirmed_at, created_at
           FROM application_thread_links
           WHERE application_id = ?
           ORDER BY created_at DESC`,
        )
        .all(application_id) as LinkRow[];
    },
    hasLink(application_id: string, gmail_thread_id: string): boolean {
      const row = db
        .prepare(
          `SELECT 1 as exists_flag
           FROM application_thread_links
           WHERE application_id = ? AND gmail_thread_id = ?
           LIMIT 1`,
        )
        .get(application_id, gmail_thread_id) as { exists_flag: number } | undefined;
      return Boolean(row);
    },
    existsThread(gmail_thread_id: string): boolean {
      const row = db
        .prepare(
          `SELECT 1 as exists_flag
           FROM application_thread_links
           WHERE gmail_thread_id = ?
           LIMIT 1`,
        )
        .get(gmail_thread_id) as { exists_flag: number } | undefined;
      return Boolean(row);
    },
    listAllThreadIds(): string[] {
      const rows = db
        .prepare(
          `SELECT DISTINCT gmail_thread_id
           FROM application_thread_links`,
        )
        .all() as { gmail_thread_id: string }[];
      return rows.map((row) => row.gmail_thread_id);
    },
  };
}
