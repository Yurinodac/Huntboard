import crypto from "node:crypto";
import type Database from "better-sqlite3";

function nowIso() {
  return new Date().toISOString();
}

export type ResumeVersionRow = {
  id: string;
  label: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string | null;
  uploaded_at: string;
  notes: string | null;
};

export function createResumesRepo(db: Database.Database) {
  return {
    list(): ResumeVersionRow[] {
      return db
        .prepare(
          `SELECT id, label, original_filename, stored_filename, mime_type, uploaded_at, notes
           FROM resume_versions
           ORDER BY uploaded_at DESC`,
        )
        .all() as ResumeVersionRow[];
    },
    get(id: string): ResumeVersionRow | undefined {
      return db
        .prepare(
          `SELECT id, label, original_filename, stored_filename, mime_type, uploaded_at, notes
           FROM resume_versions WHERE id = ?`,
        )
        .get(id) as ResumeVersionRow | undefined;
    },
    insert(input: {
      label: string;
      original_filename: string;
      stored_filename: string;
      mime_type?: string | null;
      notes?: string | null;
      uploaded_at?: string;
    }): ResumeVersionRow {
      const id = crypto.randomUUID();
      const uploaded_at = input.uploaded_at ?? nowIso();
      db.prepare(
        `INSERT INTO resume_versions (
          id, label, original_filename, stored_filename, mime_type, uploaded_at, notes
        ) VALUES (?,?,?,?,?,?,?)`,
      ).run(
        id,
        input.label,
        input.original_filename,
        input.stored_filename,
        input.mime_type ?? null,
        uploaded_at,
        input.notes ?? null,
      );
      return this.get(id)!;
    },
    updateLabel(id: string, label: string): ResumeVersionRow | undefined {
      const trimmed = label.trim();
      if (!trimmed) return undefined;
      const result = db
        .prepare(`UPDATE resume_versions SET label = ? WHERE id = ?`)
        .run(trimmed, id);
      if (result.changes === 0) return undefined;
      return this.get(id);
    },
    delete(id: string): boolean {
      const result = db.prepare(`DELETE FROM resume_versions WHERE id = ?`).run(id);
      return result.changes > 0;
    },
    countApplicationsUsing(id: string): number {
      const row = db
        .prepare(`SELECT COUNT(*) as n FROM applications WHERE resume_version_id = ?`)
        .get(id) as { n: number };
      return row.n;
    },
  };
}
