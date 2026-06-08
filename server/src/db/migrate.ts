import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      applied_date TEXT,
      status TEXT NOT NULL,
      posting_url TEXT,
      notes TEXT,
      location TEXT,
      work_arrangement TEXT NOT NULL DEFAULT 'unknown',
      salary_min REAL,
      salary_max REAL,
      contact_name TEXT,
      contact_email TEXT,
      file_links TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS application_thread_links (
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL,
      gmail_thread_id TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(application_id, gmail_thread_id),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT,
      refresh_token TEXT,
      expiry_ms INTEGER,
      scope TEXT,
      token_type TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_links_app ON application_thread_links(application_id);
  `);

  const cols = db.prepare("PRAGMA table_info(applications)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "job_summary")) {
    db.exec(`ALTER TABLE applications ADD COLUMN job_summary TEXT`);
  }
  if (!cols.some((c) => c.name === "resume_version_id")) {
    db.exec(`ALTER TABLE applications ADD COLUMN resume_version_id TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at TEXT NOT NULL,
      notes TEXT
    );
  `);

  db.prepare(`UPDATE applications SET status = 'applied' WHERE status = 'interested'`).run();
}
