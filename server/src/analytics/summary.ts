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

export type MonthSnapshot = {
  month_key: string;
  label: string;
  applications_logged: number;
  interviews: number;
  offers: number;
  rejections: number;
};

export type PaceWeek = {
  week_start: string;
  label: string;
  count: number;
};

export type SourcePerformanceRow = {
  source: string;
  total: number;
  ever_interview: number;
  ever_offer: number;
  rate_interview: number | null;
  rate_offer: number | null;
};

export type AnalyticsSummary = {
  total: number;
  active_count: number;
  past_count: number;
  by_source: Record<string, number>;
  by_source_performance: SourcePerformanceRow[];
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
  this_month: MonthSnapshot;
  pace_weeks: PaceWeek[];
};

type AppRow = {
  id: string;
  status: string;
  source: string | null;
  resume_version_id: string | null;
  resume_label: string;
  applied_date: string | null;
  created_at: string;
  first_interview_at: string | null;
  offer_at: string | null;
  rejected_at: string | null;
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

function logDateForApp(row: Pick<AppRow, "applied_date" | "created_at">): string {
  const fromApplied = row.applied_date?.trim().slice(0, 10);
  if (fromApplied && /^\d{4}-\d{2}-\d{2}$/.test(fromApplied)) return fromApplied;
  return row.created_at.slice(0, 10);
}

function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function startOfWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function buildPaceWeekBuckets(weekCount: number): Map<string, number> {
  const map = new Map<string, number>();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentWeekStart = startOfWeekMonday(todayStr);
  const anchor = new Date(`${currentWeekStart}T12:00:00.000Z`);
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  return map;
}

function emptySourceRow(source: string): SourcePerformanceRow {
  return {
    source,
    total: 0,
    ever_interview: 0,
    ever_offer: 0,
    rate_interview: null,
    rate_offer: null,
  };
}

function inMonth(iso: string | null | undefined, monthKey: string): boolean {
  if (!iso) return false;
  return iso.slice(0, 7) === monthKey;
}

export function buildAnalyticsSummary(db: Database.Database): AnalyticsSummary {
  const historyByApp = createStatusHistoryRepo(db).listAllByApplication();

  const rows = db
    .prepare(
      `SELECT a.id, a.status, a.source, a.resume_version_id,
              COALESCE(r.label, 'No resume attached') AS resume_label,
              a.applied_date, a.created_at, a.first_interview_at, a.offer_at, a.rejected_at
       FROM applications a
       LEFT JOIN resume_versions r ON r.id = a.resume_version_id`,
    )
    .all() as AppRow[];

  const now = new Date();
  const thisMonthKey = monthKeyFromDate(now.toISOString().slice(0, 10));
  const this_month: MonthSnapshot = {
    month_key: thisMonthKey,
    label: monthLabel(thisMonthKey),
    applications_logged: 0,
    interviews: 0,
    offers: 0,
    rejections: 0,
  };
  const paceMap = buildPaceWeekBuckets(8);

  const by_source: Record<string, number> = {};
  const bySourceMap = new Map<string, SourcePerformanceRow>();
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
    if (!bySourceMap.has(src)) bySourceMap.set(src, emptySourceRow(src));
    const sourcePerf = bySourceMap.get(src)!;
    sourcePerf.total += 1;

    const logDate = logDateForApp(row);
    if (monthKeyFromDate(logDate) === thisMonthKey) {
      this_month.applications_logged += 1;
    }
    if (inMonth(row.first_interview_at, thisMonthKey)) this_month.interviews += 1;
    if (inMonth(row.offer_at, thisMonthKey)) this_month.offers += 1;
    if (inMonth(row.rejected_at, thisMonthKey)) this_month.rejections += 1;

    const weekStart = startOfWeekMonday(logDate);
    if (paceMap.has(weekStart)) {
      paceMap.set(weekStart, (paceMap.get(weekStart) ?? 0) + 1);
    }

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
      sourcePerf.ever_interview += 1;
    }
    if (everReachedMilestone(ever, "offer")) {
      ever_offer += 1;
      resumeRow.ever_offer += 1;
      sourcePerf.ever_offer += 1;
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

  const by_source_performance = [...bySourceMap.values()]
    .map((row) => ({
      ...row,
      rate_interview: pct(row.ever_interview, row.total),
      rate_offer: pct(row.ever_offer, row.total),
    }))
    .sort((a, b) => (b.rate_interview ?? -1) - (a.rate_interview ?? -1) || b.total - a.total);

  const pace_weeks: PaceWeek[] = [...paceMap.entries()].map(([week_start, count]) => ({
    week_start,
    label: weekLabel(week_start),
    count,
  }));

  return {
    total: rows.length,
    active_count,
    past_count,
    by_source,
    by_source_performance,
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
    this_month,
    pace_weeks,
  };
}
