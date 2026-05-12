import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { z } from "zod";
import { ApplicationCreate, ApplicationPatch } from "../types/application.js";

function nowIso() {
  return new Date().toISOString();
}

export function createApplicationRepo(db: Database.Database) {
  return {
    list(status?: string) {
      if (status) {
        return db
          .prepare(
            `SELECT * FROM applications WHERE status = ? ORDER BY applied_date DESC, updated_at DESC`,
          )
          .all(status);
      }
      return db
        .prepare(`SELECT * FROM applications ORDER BY applied_date DESC, updated_at DESC`)
        .all();
    },
    get(id: string) {
      return db.prepare(`SELECT * FROM applications WHERE id = ?`).get(id);
    },
    insert(row: z.infer<typeof ApplicationCreate>) {
      const id = crypto.randomUUID();
      const ts = nowIso();
      const file_links = JSON.stringify(row.file_links ?? []);
      db.prepare(
        `INSERT INTO applications (
          id, company, title, applied_date, status, posting_url, notes, location,
          work_arrangement, salary_min, salary_max, contact_name, contact_email,
          file_links, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        row.company,
        row.title,
        row.applied_date ?? null,
        row.status,
        row.posting_url || null,
        row.notes ?? null,
        row.location ?? null,
        row.work_arrangement,
        row.salary_min ?? null,
        row.salary_max ?? null,
        row.contact_name ?? null,
        row.contact_email || null,
        file_links,
        ts,
        ts,
      );
      return this.get(id);
    },
    update(id: string, patch: z.infer<typeof ApplicationPatch>) {
      const cur = this.get(id) as Record<string, unknown> | undefined;
      if (!cur) return undefined;
      const next = { ...cur, ...patch, file_links: patch.file_links ?? cur.file_links };
      const updated = nowIso();
      db.prepare(
        `UPDATE applications SET
          company=@company, title=@title, applied_date=@applied_date, status=@status,
          posting_url=@posting_url, notes=@notes, location=@location,
          work_arrangement=@work_arrangement, salary_min=@salary_min, salary_max=@salary_max,
          contact_name=@contact_name, contact_email=@contact_email, file_links=@file_links,
          updated_at=@updated_at
        WHERE id=@id`,
      ).run({
        ...next,
        file_links:
          typeof next.file_links === "string"
            ? next.file_links
            : JSON.stringify(next.file_links ?? []),
        updated_at: updated,
        id,
      });
      return this.get(id);
    },
    delete(id: string) {
      db.prepare(`DELETE FROM applications WHERE id = ?`).run(id);
    },
  };
}
