/** Mirrors web/src/applicationViews.ts active/past split for server-side analytics. */
export const ACTIVE_STATUSES = [
  "applied",
  "pre_assessment",
  "recruiter_screen",
  "interview",
  "offer",
] as const;

export const PAST_STATUSES = ["rejected", "withdrawn", "archived"] as const;
