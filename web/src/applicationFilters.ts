import { getBucket, matchesBucket, type AppBucketId } from "./applicationBuckets";
import {
  ACTIVE_STATUSES,
  isPastStatus,
  matchesView,
  PAST_STATUSES,
  type ApplicationsView,
} from "./applicationViews";
import type { Application, ApplicationStatus } from "./api/client";
import { statusLabel } from "./statusLabels";
import { sourceLabel } from "./sourceLabels";

export type ApplicationsListView = ApplicationsView | "all";

export type ApplicationListFilters = {
  view: ApplicationsListView;
  bucketId: string | null;
  status: string | null;
  source: string | null;
  resume: string | null;
};

export function parseApplicationListFilters(params: URLSearchParams): ApplicationListFilters {
  const viewParam = params.get("view");
  let view: ApplicationsListView = "active";
  if (viewParam === "past") view = "past";
  else if (viewParam === "all") view = "all";

  return {
    view,
    bucketId: params.get("bucket"),
    status: params.get("status"),
    source: params.get("source"),
    resume: params.get("resume"),
  };
}

export function applicationsFilterUrl(filters: {
  view?: ApplicationsListView;
  bucket?: AppBucketId;
  status?: ApplicationStatus | string;
  source?: string;
  resume?: string | null;
}): string {
  const params = new URLSearchParams();
  if (filters.view === "past") params.set("view", "past");
  else if (filters.view === "all") params.set("view", "all");

  if (filters.bucket) params.set("bucket", filters.bucket);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.resume === null) params.set("resume", "none");
  else if (filters.resume) params.set("resume", filters.resume);

  const q = params.toString();
  return q ? `/applications?${q}` : "/applications";
}

function resumeParam(id: string | null): string {
  return id ?? "none";
}

/** Links from Analytics metrics to filtered application lists */
export const analyticsDrilldown = {
  total: () => applicationsFilterUrl({ view: "all" }),
  positiveProgress: () => applicationsFilterUrl({ view: "all", bucket: "in_conversation" }),
  interview: () => applicationsFilterUrl({ view: "all", status: "interview" }),
  offer: () => applicationsFilterUrl({ bucket: "offer" }),
  rejected: () => applicationsFilterUrl({ view: "past", status: "rejected" }),
  byStatus: (status: string) =>
    applicationsFilterUrl({
      view: isPastStatus(status as ApplicationStatus) ? "past" : "all",
      status,
    }),
  bySource: (source: string) => applicationsFilterUrl({ view: "all", source }),
  byResume: (
    resumeVersionId: string | null,
    metric: "total" | "positive_progress" | "interview" | "offer" | "rejected" = "total",
  ) => {
    const resume = resumeParam(resumeVersionId);
    if (metric === "total") return applicationsFilterUrl({ view: "all", resume });
    if (metric === "positive_progress") {
      return applicationsFilterUrl({ view: "all", resume, bucket: "in_conversation" });
    }
    if (metric === "interview") {
      return applicationsFilterUrl({ view: "all", resume, status: "interview" });
    }
    if (metric === "offer") {
      return applicationsFilterUrl({ view: "all", resume, status: "offer" });
    }
    return applicationsFilterUrl({ view: "all", resume, status: "rejected" });
  },
};

export function hasApplicationListFilters(filters: ApplicationListFilters): boolean {
  return Boolean(
    filters.bucketId ||
      filters.status ||
      filters.source ||
      filters.resume ||
      filters.view === "all",
  );
}

export function describeApplicationListFilters(
  filters: ApplicationListFilters,
  resumeLabel?: string,
): string {
  const parts: string[] = [];
  const bucket = getBucket(filters.bucketId);

  if (filters.view === "all" && !filters.bucketId && !filters.status && !filters.source && !filters.resume) {
    parts.push("All applications");
  } else if (filters.view === "past" && !filters.status && !filters.source && !filters.resume && !filters.bucketId) {
    parts.push("Past applications");
  }

  if (bucket) parts.push(bucket.label);
  if (filters.status) parts.push(statusLabel(filters.status));
  if (filters.source) parts.push(sourceLabel(filters.source));
  if (filters.resume) {
    parts.push(
      filters.resume === "none"
        ? "No resume attached"
        : resumeLabel
          ? `Resume: ${resumeLabel}`
          : "Selected resume",
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "Filtered applications";
}

export function matchesApplicationListFilters(
  app: Application,
  filters: ApplicationListFilters,
): boolean {
  if (filters.view !== "all" && !matchesView(app.status, filters.view)) return false;

  const bucket = getBucket(filters.bucketId);
  if (bucket && !matchesBucket(app.status, bucket)) return false;

  if (filters.source) {
    const appSource = app.source ?? "unknown";
    if (appSource !== filters.source) return false;
  }

  if (filters.resume) {
    const appResume = app.resume_version_id ?? "none";
    if (appResume !== filters.resume) return false;
  }

  return true;
}

export function statusOptionsForView(view: ApplicationsListView): string[] {
  if (view === "active") return ["all", ...ACTIVE_STATUSES];
  if (view === "past") return ["all", ...PAST_STATUSES];
  return ["all", ...ACTIVE_STATUSES, ...PAST_STATUSES];
}
