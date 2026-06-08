import type { ApplicationStatus } from "./api/client";

/** Still in play — shown on the Active tab */
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  "applied",
  "pre_assessment",
  "recruiter_screen",
  "interview",
  "offer",
];

/** Closed out — shown on the Past tab (rejected and similar) */
export const PAST_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn", "archived"];

export type ApplicationsView = "active" | "past";

export function isActiveStatus(status: ApplicationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isPastStatus(status: ApplicationStatus): boolean {
  return PAST_STATUSES.includes(status);
}

export function matchesView(status: ApplicationStatus, view: ApplicationsView): boolean {
  return view === "active" ? isActiveStatus(status) : isPastStatus(status);
}
