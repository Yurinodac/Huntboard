import type Database from "better-sqlite3";
import { POSITIVE_PROGRESS_STATUSES } from "../analytics/milestones.js";
import { createApplicationRepo } from "../db/applicationsRepo.js";

export const DEFAULT_STALE_APPLIED_DAYS = 30;

/** Statuses that mean the application moved forward from Applied. */
const LEFT_APPLIED_STATUSES = [...POSITIVE_PROGRESS_STATUSES, "offer"];

export type StaleAppliedRow = {
  id: string;
  company: string;
  title: string;
  applied_since: string;
  days_in_applied: number;
};

export type RecalledStaleRow = {
  id: string;
  company: string;
  title: string;
};

function daysBetween(from: string, to: Date): number {
  const normalized = from.length === 10 ? `${from}T12:00:00.000Z` : from;
  const start = new Date(normalized);
  return Math.floor((to.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function appliedSinceForRow(row: {
  first_applied_at: string | null;
  applied_date: string | null;
  created_at: string;
}): string {
  return row.first_applied_at ?? row.applied_date ?? row.created_at;
}

export function findStaleApplied(
  db: Database.Database,
  days = DEFAULT_STALE_APPLIED_DAYS,
  now = new Date(),
): StaleAppliedRow[] {
  const placeholders = LEFT_APPLIED_STATUSES.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT a.id, a.company, a.title, a.applied_date, a.created_at,
        (SELECT MIN(h.changed_at) FROM application_status_history h
         WHERE h.application_id = a.id AND h.to_status = 'applied') AS first_applied_at
      FROM applications a
      WHERE a.status = 'applied'
      AND NOT EXISTS (
        SELECT 1 FROM application_status_history h
        WHERE h.application_id = a.id
        AND h.to_status IN (${placeholders})
      )`,
    )
    .all(...LEFT_APPLIED_STATUSES) as Array<{
    id: string;
    company: string;
    title: string;
    applied_date: string | null;
    created_at: string;
    first_applied_at: string | null;
  }>;

  const result: StaleAppliedRow[] = [];
  for (const row of rows) {
    const appliedSince = appliedSinceForRow(row);
    const daysInApplied = daysBetween(appliedSince, now);
    if (daysInApplied >= days) {
      result.push({
        id: row.id,
        company: row.company,
        title: row.title,
        applied_since: appliedSince,
        days_in_applied: daysInApplied,
      });
    }
  }

  result.sort((a, b) => a.applied_since.localeCompare(b.applied_since));
  return result;
}

export function archiveStaleApplied(
  db: Database.Database,
  days = DEFAULT_STALE_APPLIED_DAYS,
  ids?: string[],
  now = new Date(),
): { archived: StaleAppliedRow[] } {
  const stale = findStaleApplied(db, days, now);
  const toArchive = ids ? stale.filter((row) => ids.includes(row.id)) : stale;
  const repo = createApplicationRepo(db);
  const archivedAt = now.toISOString();
  for (const row of toArchive) {
    repo.update(row.id, { status: "archived" });
    db.prepare(`UPDATE applications SET stale_archived_at = ? WHERE id = ?`).run(archivedAt, row.id);
  }
  return { archived: toArchive };
}

export function recallStaleArchived(
  db: Database.Database,
  applicationId: string,
): RecalledStaleRow | null {
  const row = db
    .prepare(
      `SELECT id, company, title, status, stale_archived_at
       FROM applications WHERE id = ?`,
    )
    .get(applicationId) as
    | {
        id: string;
        company: string;
        title: string;
        status: string;
        stale_archived_at: string | null;
      }
    | undefined;

  if (!row?.stale_archived_at || row.status !== "archived") return null;

  const repo = createApplicationRepo(db);
  repo.update(applicationId, { status: "applied" });
  return { id: row.id, company: row.company, title: row.title };
}

export function isEligibleForStaleRecall(row: {
  status?: string | null;
  stale_archived_at?: string | null;
}): boolean {
  return row.status === "archived" && Boolean(row.stale_archived_at);
}
