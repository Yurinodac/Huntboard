import type { ApplicationSource } from "./api/client";

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: "LinkedIn",
  job_board: "Job board / ATS",
  company_site: "Company careers site",
  paste: "Pasted description",
  email: "Email",
  manual: "Manual entry",
  unknown: "Unknown",
};

export function sourceLabel(source: ApplicationSource | string | null | undefined): string {
  if (!source) return SOURCE_LABELS.unknown;
  return SOURCE_LABELS[source as ApplicationSource] ?? String(source);
}
