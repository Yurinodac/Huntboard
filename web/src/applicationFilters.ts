import { getBucket, matchesBucket, type AppBucketId } from "./applicationBuckets";
import {
  ACTIVE_STATUSES,
  isPastStatus,
  matchesView,
  PAST_STATUSES,
  type ApplicationsView,
} from "./applicationViews";
import type { Application, ApplicationStatus } from "./api/client";
import { sourceLabel } from "./sourceLabels";
import { statusLabel } from "./statusLabels";

export type ApplicationsListView = ApplicationsView | "all";

export type MilestoneFilter =
  | "positive_progress"
  | "pre_assessment"
  | "recruiter_screen"
  | "interview"
  | "offer"
  | "rejected";

const MILESTONE_STATUSES: Record<MilestoneFilter, readonly string[]> = {
  positive_progress: ["pre_assessment", "recruiter_screen", "interview"],
  pre_assessment: ["pre_assessment"],
  recruiter_screen: ["recruiter_screen"],
  interview: ["interview"],
  offer: ["offer"],
  rejected: ["rejected"],
};

export type ApplicationListFilters = {
  view: ApplicationsListView;
  bucketId: string | null;
  status: string | null;
  source: string | null;
  resume: string | null;
  milestone: MilestoneFilter | null;
};

export function parseApplicationListFilters(params: URLSearchParams): ApplicationListFilters {
  const viewParam = params.get("view");
  let view: ApplicationsListView = "active";
  if (viewParam === "past") view = "past";
  else if (viewParam === "all") view = "all";

  const milestoneParam = params.get("milestone");
  const milestone =
    milestoneParam && milestoneParam in MILESTONE_STATUSES
      ? (milestoneParam as MilestoneFilter)
      : null;

  return {
    view,
    bucketId: params.get("bucket"),
    status: params.get("status"),
    source: params.get("source"),
    resume: params.get("resume"),
    milestone,
  };
}

export function applicationsFilterUrl(filters: {
  view?: ApplicationsListView;
  bucket?: AppBucketId;
  status?: ApplicationStatus | string;
  source?: string;
  resume?: string | null;
  milestone?: MilestoneFilter;
}): string {
  const params = new URLSearchParams();
  if (filters.view === "past") params.set("view", "past");
  else if (filters.view === "all") params.set("view", "all");

  if (filters.bucket) params.set("bucket", filters.bucket);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.milestone) params.set("milestone", filters.milestone);
  if (filters.resume === null) params.set("resume", "none");
  else if (filters.resume) params.set("resume", filters.resume);

  const q = params.toString();
  return q ? `/applications?${q}` : "/applications";
}

function resumeParam(id: string | null): string {
  return id ?? "none";
}

function milestoneLabel(milestone: MilestoneFilter): string {
  switch (milestone) {
    case "positive_progress":
      return "Ever reached pre-assess / screen / interview";
    case "pre_assessment":
      return "Ever reached pre-assessment";
    case "recruiter_screen":
      return "Ever reached recruiter screen";
    case "interview":
      return "Ever reached interview";
    case "offer":
      return "Ever got offer";
    case "rejected":
      return "Ever rejected";
  }
}

function everReachedMilestone(app: Application, milestone: MilestoneFilter): boolean {
  const ever = new Set<string>(app.statuses_ever_reached ?? [app.status]);
  return MILESTONE_STATUSES[milestone].some((status) => ever.has(status));
}

/** Links from Analytics metrics to filtered application lists */
export const analyticsDrilldown = {
  total: () => applicationsFilterUrl({ view: "all" }),
  active: () => applicationsFilterUrl({ view: "active" }),
  positiveProgress: () => applicationsFilterUrl({ view: "all", bucket: "in_conversation" }),
  everPositiveProgress: () =>
    applicationsFilterUrl({ view: "all", milestone: "positive_progress" }),
  interview: () => applicationsFilterUrl({ view: "all", status: "interview" }),
  everInterview: () => applicationsFilterUrl({ view: "all", milestone: "interview" }),
  offer: () => applicationsFilterUrl({ bucket: "offer" }),
  everOffer: () => applicationsFilterUrl({ view: "all", milestone: "offer" }),
  rejected: () => applicationsFilterUrl({ view: "past", status: "rejected" }),
  everRejected: () => applicationsFilterUrl({ view: "all", milestone: "rejected" }),
  bySource: (source: string) => applicationsFilterUrl({ view: "all", source }),
  byResume: (
    resumeVersionId: string | null,
    metric:
      | "total"
      | "ever_positive_progress"
      | "ever_pre_assessment"
      | "ever_recruiter_screen"
      | "ever_interview"
      | "ever_offer"
      | "ever_rejected" = "total",
  ) => {
    const resume = resumeParam(resumeVersionId);
    if (metric === "total") return applicationsFilterUrl({ view: "all", resume });
    if (metric === "ever_positive_progress") {
      return applicationsFilterUrl({ view: "all", resume, milestone: "positive_progress" });
    }
    if (metric === "ever_pre_assessment") {
      return applicationsFilterUrl({ view: "all", resume, milestone: "pre_assessment" });
    }
    if (metric === "ever_recruiter_screen") {
      return applicationsFilterUrl({ view: "all", resume, milestone: "recruiter_screen" });
    }
    if (metric === "ever_interview") {
      return applicationsFilterUrl({ view: "all", resume, milestone: "interview" });
    }
    if (metric === "ever_offer") {
      return applicationsFilterUrl({ view: "all", resume, milestone: "offer" });
    }
    return applicationsFilterUrl({ view: "all", resume, milestone: "rejected" });
  },
};

export function hasApplicationListFilters(filters: ApplicationListFilters): boolean {
  return Boolean(
    filters.bucketId ||
      filters.status ||
      filters.source ||
      filters.resume ||
      filters.milestone ||
      filters.view === "all",
  );
}

export function describeApplicationListFilters(
  filters: ApplicationListFilters,
  resumeLabel?: string,
): string {
  const parts: string[] = [];
  const bucket = getBucket(filters.bucketId);

  if (
    filters.view === "all" &&
    !filters.bucketId &&
    !filters.status &&
    !filters.source &&
    !filters.resume &&
    !filters.milestone
  ) {
    parts.push("All applications");
  } else if (
    filters.view === "past" &&
    !filters.status &&
    !filters.source &&
    !filters.resume &&
    !filters.milestone &&
    !filters.bucketId
  ) {
    parts.push("Past applications");
  } else if (filters.view === "active" && !filters.bucketId && !filters.status && !filters.source && !filters.resume && !filters.milestone) {
    parts.push("Active pipeline");
  }

  if (bucket) parts.push(bucket.label);
  if (filters.milestone) parts.push(milestoneLabel(filters.milestone));
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

  if (filters.status && app.status !== filters.status) return false;

  if (filters.source) {
    const appSource = app.source ?? "unknown";
    if (appSource !== filters.source) return false;
  }

  if (filters.resume) {
    const appResume = app.resume_version_id ?? "none";
    if (appResume !== filters.resume) return false;
  }

  if (filters.milestone && !everReachedMilestone(app, filters.milestone)) return false;

  return true;
}

export function statusOptionsForView(view: ApplicationsListView): string[] {
  if (view === "active") return ["all", ...ACTIVE_STATUSES];
  if (view === "past") return ["all", ...PAST_STATUSES];
  return ["all", ...ACTIVE_STATUSES, ...PAST_STATUSES];
}

export { isPastStatus };
