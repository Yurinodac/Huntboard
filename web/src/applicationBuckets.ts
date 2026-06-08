import type { ApplicationStatus } from "./api/client";
import { isActiveStatus } from "./applicationViews";

export type AppBucketId = "active" | "in_conversation" | "offer" | "applied" | "pre_assessment";

export type AppBucket = {
  id: AppBucketId;
  label: string;
  statuses: ApplicationStatus[];
};

export const APP_BUCKETS: AppBucket[] = [
  {
    id: "active",
    label: "Active pipeline",
    statuses: [
      "applied",
      "pre_assessment",
      "recruiter_screen",
      "interview",
      "offer",
    ],
  },
  {
    id: "in_conversation",
    label: "In conversation",
    statuses: ["pre_assessment", "recruiter_screen", "interview"],
  },
  {
    id: "applied",
    label: "Applied",
    statuses: ["applied"],
  },
  {
    id: "pre_assessment",
    label: "Pre-assessment",
    statuses: ["pre_assessment"],
  },
  {
    id: "offer",
    label: "Offers",
    statuses: ["offer"],
  },
];

export function getBucket(id: string | null): AppBucket | undefined {
  return APP_BUCKETS.find((b) => b.id === id);
}

export function matchesBucket(status: ApplicationStatus, bucket: AppBucket): boolean {
  return bucket.statuses.includes(status);
}

export { isActiveStatus };
