import type Database from "better-sqlite3";
import { createStatusHistoryRepo } from "../db/statusHistoryRepo.js";
import {
  everReachedMilestone,
  pct,
  POSITIVE_PROGRESS_STATUSES,
} from "./milestones.js";
import { ACTIVE_STATUSES, PAST_STATUSES } from "./statusGroups.js";

export type ResumeAnalyticsRow = {
  resume_version_id: string | null;
  label: string;
  total: number;
  /** Ever reached pre-assessment, recruiter screen, or interview */
  ever_positive_progress: number;
  ever_pre_assessment: number;
  ever_recruiter_screen: number;
  ever_interview: number;
  ever_offer: number;
  ever_rejected: number;
  /** % of this resume's applications that ever reached interview */
  rate_interview: number | null;
  /** % of this resume's applications that ever got an offer */
  rate_offer: number | null;
};

export type ConversionStats = {
  ever_positive_progress: number;
  ever_interview: number;
  ever_offer: number;
  ever_rejected: number;
  rate_positive_progress: number | null;
  rate_interview: number | null;
  rate_offer: number | null;
  /** Among apps that ever reached interview, % that ever got an offer */
  interview_to_offer_rate: number | null;
};

export type AnalyticsSummary = {
  total: number;
  active_count: number;
  past_count: number;
  by_source: Record<string, number>;
  by_resume: ResumeAnalyticsRow[];
  funnel: {
    total: number;
    active: number;
    /** Currently at pre-assessment, screen, or interview */
    positive_progress: number;
    interview: number;
    offer: number;
    rejected: number;
  };
  conversion: ConversionStats;
};

type AppRow = {
  id: string;
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
    ever_positive_progress: 0,
    ever_pre_assessment: 0,
    ever_recruiter_screen: 0,
    ever_interview: 0,
    ever_offer: 0,
    ever_rejected: 0,
    rate_interview: null,
    rate_offer: null,
  };
}

export function buildAnalyticsSummary(db: Database.Database): AnalyticsSummary {
  const historyByApp = createStatusHistoryRepo(db).listAllByApplication();

  const rows = db
    .prepare(
      `SELECT a.id, a.status, a.source, a.resume_version_id,
              COALESCE(r.label, 'No resume attached') AS resume_label
       FROM applications a
       LEFT JOIN resume_versions r ON r.id = a.resume_version_id`,
    )
    .all() as AppRow[];

  const by_source: Record<string, number> = {};
  const byResumeMap = new Map<string, ResumeAnalyticsRow>();
  let active_count = 0;
  let past_count = 0;
  let current_positive_progress = 0;
  let current_interview = 0;
  let current_offer = 0;
  let current_rejected = 0;

  let ever_positive_progress = 0;
  let ever_interview = 0;
  let ever_offer = 0;
  let ever_rejected = 0;

  for (const row of rows) {
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

    if (POSITIVE_PROGRESS_STATUSES.has(row.status)) current_positive_progress += 1;
    if (row.status === "interview") current_interview += 1;
    if (row.status === "offer") current_offer += 1;
    if (row.status === "rejected") current_rejected += 1;

    const ever = historyByApp.get(row.id) ?? new Set([row.status]);

    if (everReachedMilestone(ever, "positive_progress")) {
      ever_positive_progress += 1;
      resumeRow.ever_positive_progress += 1;
    }
    if (everReachedMilestone(ever, "pre_assessment")) resumeRow.ever_pre_assessment += 1;
    if (everReachedMilestone(ever, "recruiter_screen")) resumeRow.ever_recruiter_screen += 1;
    if (everReachedMilestone(ever, "interview")) {
      ever_interview += 1;
      resumeRow.ever_interview += 1;
    }
    if (everReachedMilestone(ever, "offer")) {
      ever_offer += 1;
      resumeRow.ever_offer += 1;
    }
    if (everReachedMilestone(ever, "rejected")) {
      ever_rejected += 1;
      resumeRow.ever_rejected += 1;
    }
  }

  const by_resume = [...byResumeMap.values()]
    .map((row) => ({
      ...row,
      rate_interview: pct(row.ever_interview, row.total),
      rate_offer: pct(row.ever_offer, row.total),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total: rows.length,
    active_count,
    past_count,
    by_source,
    by_resume,
    funnel: {
      total: rows.length,
      active: active_count,
      positive_progress: current_positive_progress,
      interview: current_interview,
      offer: current_offer,
      rejected: current_rejected,
    },
    conversion: {
      ever_positive_progress,
      ever_interview,
      ever_offer,
      ever_rejected,
      rate_positive_progress: pct(ever_positive_progress, rows.length),
      rate_interview: pct(ever_interview, rows.length),
      rate_offer: pct(ever_offer, rows.length),
      interview_to_offer_rate: pct(ever_offer, ever_interview),
    },
  };
}
