import { z } from "zod";

export const ApplicationStatus = z.enum([
  "applied",
  "pre_assessment",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
]);

export type ApplicationStatusValue = z.infer<typeof ApplicationStatus>;

export const WorkArrangement = z.enum(["remote", "hybrid", "onsite", "unknown"]);

export type WorkArrangementValue = z.infer<typeof WorkArrangement>;

/** Auto-set on create from posting URL or route; not user-editable via PATCH. */
export const ApplicationSource = z.enum([
  "linkedin",
  "job_board",
  "company_site",
  "paste",
  "email",
  "manual",
  "unknown",
]);

export type ApplicationSourceValue = z.infer<typeof ApplicationSource>;

export const ApplicationCreate = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  applied_date: z.string().optional(),
  status: ApplicationStatus,
  posting_url: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  job_summary: z.string().optional(),
  location: z.string().optional(),
  work_arrangement: WorkArrangement.default("unknown"),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  file_links: z.array(z.string()).default([]),
  resume_version_id: z.string().uuid().optional().nullable(),
});

export const ApplicationPatch = ApplicationCreate.partial();

export type ApplicationRecord = z.infer<typeof ApplicationCreate> & {
  id: string;
  source: ApplicationSourceValue;
  first_interview_at: string | null;
  offer_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StatusHistoryRecord = {
  id: string;
  application_id: string;
  from_status: ApplicationStatusValue | null;
  to_status: ApplicationStatusValue;
  changed_at: string;
};
