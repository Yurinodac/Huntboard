import type Database from "better-sqlite3";
import { ACTIVE_STATUSES, PAST_STATUSES } from "./statusGroups.js";

/** Pre-assessment, screen, or interview — positive pipeline movement (excludes offer/rejected). */
const POSITIVE_PROGRESS_STATUSES = new Set([
  "pre_assessment",
  "recruiter_screen",
  "interview",
]);

export type ResumeAnalyticsRow = {
  resume_version_id: string | null;
  label: string;
  total: number;
  positive_progress: number;
  interview: number;
  offer: number;
  rejected: number;
};

export type AnalyticsSummary = {
  total: number;
  active_count: number;
  past_count: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_resume: ResumeAnalyticsRow[];
  funnel: {
    total: number;
    positive_progress: number;
    interview: number;
    offer: number;
    rejected: number;
  };
};

type AppRow = {
  status: string;
  source: string | null;
  resume_version_id: string | null;
  resume_label: string;
};

function emptyResumeRow(resume_version_id: string | null, label: string): ResumeAnalyticsRow {
  return {
    resume_version_id,
    label,
    total: 0,
    positive_progress: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };
}

export function buildAnalyticsSummary(db: Database.Database): AnalyticsSummary {
  const rows = db
    .prepare(
      `SELECT a.status, a.source, a.resume_version_id,
              COALESCE(r.label, 'No resume attached') AS resume_label
       FROM applications a
       LEFT JOIN resume_versions r ON r.id = a.resume_version_id`,
    )
    .all() as AppRow[];

  const by_status: Record<string, number> = {};
  const by_source: Record<string, number> = {};
  const byResumeMap = new Map<string, ResumeAnalyticsRow>();
  let active_count = 0;
  let past_count = 0;
  let positive_progress = 0;
  let interview = 0;
  let offer = 0;
  let rejected = 0;

  for (const row of rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + 1;
    const src = row.source ?? "unknown";
    by_source[src] = (by_source[src] ?? 0) + 1;

    const resumeKey = row.resume_version_id ?? "__none__";
    if (!byResumeMap.has(resumeKey)) {
      byResumeMap.set(resumeKey, emptyResumeRow(row.resume_version_id, row.resume_label));
    }
    const resumeRow = byResumeMap.get(resumeKey)!;
    resumeRow.total += 1;

    if ((ACTIVE_STATUSES as readonly string[]).includes(row.status)) active_count += 1;
    if ((PAST_STATUSES as readonly string[]).includes(row.status)) past_count += 1;

    if (POSITIVE_PROGRESS_STATUSES.has(row.status)) {
      positive_progress += 1;
      resumeRow.positive_progress += 1;
    }
    if (row.status === "interview") {
      interview += 1;
      resumeRow.interview += 1;
    }
    if (row.status === "offer") {
      offer += 1;
      resumeRow.offer += 1;
    }
    if (row.status === "rejected") {
      rejected += 1;
      resumeRow.rejected += 1;
    }
  }

  const by_resume = [...byResumeMap.values()].sort((a, b) => b.total - a.total);

  return {
    total: rows.length,
    active_count,
    past_count,
    by_status,
    by_source,
    by_resume,
    funnel: {
      total: rows.length,
      positive_progress,
      interview,
      offer,
      rejected,
    },
  };
}
