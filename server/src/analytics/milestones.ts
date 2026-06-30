/** Statuses that count as positive pipeline movement (excludes offer). */
export const POSITIVE_PROGRESS_STATUSES = new Set([
  "pre_assessment",
  "recruiter_screen",
  "interview",
]);

export type MilestoneKey =
  | "positive_progress"
  | "pre_assessment"
  | "recruiter_screen"
  | "interview"
  | "offer"
  | "rejected";

const MILESTONE_STATUSES: Record<MilestoneKey, readonly string[]> = {
  positive_progress: ["pre_assessment", "recruiter_screen", "interview"],
  pre_assessment: ["pre_assessment"],
  recruiter_screen: ["recruiter_screen"],
  interview: ["interview"],
  offer: ["offer"],
  rejected: ["rejected"],
};

export function statusesEverReached(historyRows: Array<{ to_status: string }>): Set<string> {
  return new Set(historyRows.map((row) => row.to_status));
}

export function everReachedMilestone(ever: Set<string>, milestone: MilestoneKey): boolean {
  return MILESTONE_STATUSES[milestone].some((status) => ever.has(status));
}

export function pct(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}
