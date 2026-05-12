import type Database from "better-sqlite3";

export function createSyncStateRepo(db: Database.Database) {
  return {
    get(key: string): string | undefined {
      const row = db
        .prepare("SELECT value FROM sync_state WHERE key = ?")
        .get(key) as { value: string } | undefined;
      return row?.value;
    },
    set(key: string, value: string): void {
      db.prepare(
        `INSERT INTO sync_state (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },
  };
}
