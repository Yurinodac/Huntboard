import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { z } from "zod";
import {
  ApplicationCreate,
  ApplicationPatch,
  type ApplicationSourceValue,
  type ApplicationStatusValue,
} from "../types/application.js";
import { detectSourceFromPostingUrl } from "../import/detectSource.js";
import { createStatusHistoryRepo } from "./statusHistoryRepo.js";

function nowIso() {
  return new Date().toISOString();
}

function keyDatesForStatus(
  status: ApplicationStatusValue,
  cur: Record<string, unknown>,
  ts: string,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (status === "interview" && !cur.first_interview_at) patch.first_interview_at = ts;
  if (status === "offer" && !cur.offer_at) patch.offer_at = ts;
  if (status === "rejected" && !cur.rejected_at) patch.rejected_at = ts;
  return patch;
}

export function createApplicationRepo(db: Database.Database) {
  const history = createStatusHistoryRepo(db);

  return {
    list(status?: string) {
      if (status) {
        return db
          .prepare(
            `SELECT * FROM applications WHERE status = ? ORDER BY applied_date DESC, created_at DESC`,
          )
          .all(status);
      }
      return db
        .prepare(`SELECT * FROM applications ORDER BY applied_date DESC, created_at DESC`)
        .all();
    },
    get(id: string) {
      return db.prepare(`SELECT * FROM applications WHERE id = ?`).get(id);
    },
    listStatusHistory(applicationId: string) {
      return history.listByApplication(applicationId);
    },
    insert(row: z.infer<typeof ApplicationCreate>, source?: ApplicationSourceValue) {
      const id = crypto.randomUUID();
      const ts = nowIso();
      const file_links = JSON.stringify(row.file_links ?? []);
      const keyDates = keyDatesForStatus(row.status, {}, ts);
      const resolvedSource = source ?? detectSourceFromPostingUrl(row.posting_url);

      const runInsert = db.transaction(() => {
        db.prepare(
          `INSERT INTO applications (
            id, company, title, applied_date, status, posting_url, notes, job_summary, location,
            work_arrangement, salary_min, salary_max, contact_name, contact_email,
            file_links, resume_version_id, source, first_interview_at, offer_at, rejected_at,
            created_at, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          id,
          row.company,
          row.title,
          row.applied_date ?? null,
          row.status,
          row.posting_url || null,
          row.notes ?? null,
          row.job_summary ?? null,
          row.location ?? null,
          row.work_arrangement,
          row.salary_min ?? null,
          row.salary_max ?? null,
          row.contact_name ?? null,
          row.contact_email || null,
          file_links,
          row.resume_version_id ?? null,
          resolvedSource,
          keyDates.first_interview_at ?? null,
          keyDates.offer_at ?? null,
          keyDates.rejected_at ?? null,
          ts,
          ts,
        );
        history.record(id, null, row.status, ts);
      });
      runInsert();
      return this.get(id);
    },
    update(id: string, patch: z.infer<typeof ApplicationPatch>) {
      const cur = this.get(id) as Record<string, unknown> | undefined;
      if (!cur) return undefined;

      const patchKeys = Object.keys(patch);
      const resumeOnly =
        patchKeys.length > 0 && patchKeys.every((key) => key === "resume_version_id");
      const updated = resumeOnly ? String(cur.updated_at) : nowIso();

      const nextStatus =
        patch.status !== undefined ? (patch.status as ApplicationStatusValue) : (cur.status as ApplicationStatusValue);
      const statusChanged =
        patch.status !== undefined && patch.status !== cur.status;
      const keyDatePatch = statusChanged ? keyDatesForStatus(nextStatus, cur, updated) : {};

      const next = {
        ...cur,
        ...patch,
        ...keyDatePatch,
        file_links: patch.file_links ?? cur.file_links,
      };

      const runUpdate = db.transaction(() => {
        if (statusChanged) {
          history.record(
            id,
            cur.status as ApplicationStatusValue,
            nextStatus,
            updated,
          );
        }
        db.prepare(
          `UPDATE applications SET
            company=@company, title=@title, applied_date=@applied_date, status=@status,
            posting_url=@posting_url, notes=@notes, job_summary=@job_summary, location=@location,
            work_arrangement=@work_arrangement, salary_min=@salary_min, salary_max=@salary_max,
            contact_name=@contact_name, contact_email=@contact_email, file_links=@file_links,
            resume_version_id=@resume_version_id, source=@source,
            first_interview_at=@first_interview_at, offer_at=@offer_at, rejected_at=@rejected_at,
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
      });
      runUpdate();
      return this.get(id);
    },
    delete(id: string) {
      db.prepare(`DELETE FROM applications WHERE id = ?`).run(id);
    },
  };
}
