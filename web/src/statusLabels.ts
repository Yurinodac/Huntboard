import { APPLICATION_STATUSES, type ApplicationStatus } from "./api/client";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  pre_assessment: "Pre-assessment",
  recruiter_screen: "Recruiter screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export function statusLabel(status: ApplicationStatus | string): string {
  const key = status as ApplicationStatus;
  return STATUS_LABELS[key] ?? String(status).replace(/_/g, " ");
}

/** Map UI label from field suggestions → API status value */
export function statusFromProposedLabel(proposed: string): ApplicationStatus {
  const normalized = proposed.trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  if ((APPLICATION_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as ApplicationStatus;
  }
  const fromLabel = Object.entries(STATUS_LABELS).find(
    ([, label]) => label.toLowerCase().replace(/-/g, " ") === proposed.trim().toLowerCase(),
  );
  if (fromLabel) return fromLabel[0] as ApplicationStatus;
  return proposed.replace(/\s+/g, "_") as ApplicationStatus;
}
