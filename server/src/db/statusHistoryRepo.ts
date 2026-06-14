import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { ApplicationStatusValue } from "../types/application.js";

export type StatusHistoryRow = {
  id: string;
  application_id: string;
  from_status: ApplicationStatusValue | null;
  to_status: ApplicationStatusValue;
  changed_at: string;
};

export function createStatusHistoryRepo(db: Database.Database) {
  return {
    record(
      applicationId: string,
      fromStatus: ApplicationStatusValue | null,
      toStatus: ApplicationStatusValue,
      changedAt: string,
    ) {
      if (fromStatus === toStatus) return;
      db.prepare(
        `INSERT INTO application_status_history (
          id, application_id, from_status, to_status, changed_at
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), applicationId, fromStatus, toStatus, changedAt);
    },
    listByApplication(applicationId: string): StatusHistoryRow[] {
      return db
        .prepare(
          `SELECT id, application_id, from_status, to_status, changed_at
           FROM application_status_history
           WHERE application_id = ?
           ORDER BY changed_at ASC`,
        )
        .all(applicationId) as StatusHistoryRow[];
    },
  };
}
