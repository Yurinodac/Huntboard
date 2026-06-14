import { type ApplicationSourceValue } from "../types/application.js";

/** Infer application channel from posting URL (no user input). */
export function detectSourceFromPostingUrl(url: string | null | undefined): ApplicationSourceValue {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "manual";
  if (trimmed.startsWith("pasted://")) return "paste";

  let host = "";
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (/linkedin\.com$/i.test(host) || host.endsWith(".linkedin.com")) return "linkedin";
  if (
    /indeed\.com$/i.test(host) ||
    host.endsWith(".indeed.com") ||
    /glassdoor\.com$/i.test(host) ||
    host.endsWith(".glassdoor.com") ||
    /ziprecruiter\.com$/i.test(host) ||
    host.endsWith(".ziprecruiter.com")
  ) {
    return "job_board";
  }
  if (
    host.includes("greenhouse.io") ||
    host.includes("lever.co") ||
    host.includes("ashbyhq.com") ||
    host.includes("myworkdayjobs.com") ||
    host.includes("icims.com") ||
    host.includes("smartrecruiters.com") ||
    host.includes("jobvite.com")
  ) {
    return "job_board";
  }
  if (host.startsWith("www.")) host = host.slice(4);
  if (host.includes(".")) return "company_site";
  return "unknown";
}
