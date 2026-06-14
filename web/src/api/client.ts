export const APPLICATION_STATUSES = [
  "applied",
  "pre_assessment",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";

export type ApplicationSource =
  | "linkedin"
  | "job_board"
  | "company_site"
  | "paste"
  | "email"
  | "manual"
  | "unknown";

export type Application = {
  id: string;
  company: string;
  title: string;
  applied_date?: string | null;
  status: ApplicationStatus;
  source?: ApplicationSource;
  posting_url?: string | null;
  notes?: string | null;
  job_summary?: string | null;
  location?: string | null;
  work_arrangement: WorkArrangement;
  salary_min?: number | null;
  salary_max?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  file_links: string[] | string;
  resume_version_id?: string | null;
  first_interview_at?: string | null;
  offer_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationBody = {
  company: string;
  title: string;
  applied_date?: string;
  status: ApplicationStatus;
  posting_url?: string;
  notes?: string;
  job_summary?: string;
  location?: string;
  work_arrangement?: WorkArrangement;
  salary_min?: number;
  salary_max?: number;
  contact_name?: string;
  contact_email?: string;
  file_links?: string[];
  resume_version_id?: string | null;
};

export type ResumeVersion = {
  id: string;
  label: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string | null;
  uploaded_at: string;
  notes: string | null;
};

export type ApplicationThread = {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  fromDisplay?: string | null;
  fromEmail?: string | null;
  placeholder?: boolean;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = Boolean(init?.body);
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) detail = body.error;
      code = body.code;
    } catch {
      /* non-JSON body */
    }
    throw new ApiRequestError(
      detail || `Request failed: ${response.status}`,
      response.status,
      code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getApplications(status?: string) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<Application[]>(`/api/v1/applications${suffix}`);
}

export function getApplication(id: string) {
  return request<Application>(`/api/v1/applications/${id}`);
}

export function createApplication(body: ApplicationBody) {
  return request<Application>("/api/v1/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchApplication(id: string, body: Partial<ApplicationBody>) {
  return request<Application>(`/api/v1/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteApplication(id: string) {
  return request<void>(`/api/v1/applications/${id}`, {
    method: "DELETE",
  });
}

export async function getApplicationThreads(id: string) {
  const data = await request<{ threads?: ApplicationThread[] }>(
    `/api/v1/applications/${id}/threads`,
  );
  return data.threads ?? [];
}

export type GmailStatus = {
  connected: boolean;
  last_sync_at: string | null;
};

export type FieldUpdateSuggestion = {
  field: string;
  label: string;
  current: string | null;
  proposed: string;
  reason: string;
};

export type GmailSuggestion = {
  application_id: string;
  gmail_thread_id: string;
  subject: string;
  from: string;
  snippet: string;
  score: number;
  reason_codes: string[];
  ai_summary?: string;
  propose_create?: boolean;
  field_updates?: FieldUpdateSuggestion[];
};

export type GmailSyncResult = {
  suggestions: GmailSuggestion[];
  synced_at: string;
  inbox_empty?: boolean;
  ai_used?: boolean;
};

export function getGmailStatus() {
  return request<GmailStatus>("/api/v1/gmail/status");
}

export async function getGmailOAuthStartUrl() {
  const data = await request<{ authUrl: string }>("/api/v1/gmail/oauth/start");
  return data.authUrl;
}

export function postGmailSync() {
  return request<GmailSyncResult>("/api/v1/gmail/sync", { method: "POST" });
}

export type ImportUrlPreview = {
  preview: ApplicationBody & { posting_url?: string; source?: ApplicationSource };
  sources: string[];
  warnings?: string[];
  ai_used?: boolean;
};

export type ResumeAnalyticsRow = {
  resume_version_id: string | null;
  label: string;
  total: number;
  positive_progress: number;
  interview: number;
  offer: number;
  rejected: number;
};

export type AnalyticsSummary = {
  total: number;
  active_count: number;
  past_count: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_resume: ResumeAnalyticsRow[];
  funnel: {
    total: number;
    positive_progress: number;
    interview: number;
    offer: number;
    rejected: number;
  };
};

export type StatusHistoryEntry = {
  id: string;
  application_id: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  changed_at: string;
};

export type AiStatus = {
  enabled: boolean;
  model: string | null;
};

export function getAiStatus() {
  return request<AiStatus>("/api/v1/ai/status");
}

export function getAnalyticsSummary() {
  return request<AnalyticsSummary>("/api/v1/analytics/summary");
}

export function getApplicationStatusHistory(id: string) {
  return request<{ history: StatusHistoryEntry[] }>(`/api/v1/applications/${id}/history`);
}

/** Opens CSV download in browser (same origin as API). */
export function applicationsExportCsvUrl() {
  return "/api/v1/applications/export.csv";
}

export function importApplicationFromUrl(url: string) {
  return request<ImportUrlPreview>("/api/v1/applications/import-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function importApplicationFromPaste(text: string, url?: string) {
  return request<ImportUrlPreview>("/api/v1/applications/import-paste", {
    method: "POST",
    body: JSON.stringify({ text, url: url?.trim() || undefined }),
  });
}

export function createApplicationFromEmail(input: {
  from: string;
  subject: string;
  snippet?: string;
  gmail_thread_id?: string;
}) {
  return request<Application>("/api/v1/applications/from-email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmGmailSuggestion(
  application_id: string,
  gmail_thread_id: string,
  options?: {
    field_updates?: Partial<ApplicationBody>;
    link_thread?: boolean;
  },
) {
  return request<{
    link: {
      id: string;
      application_id: string;
      gmail_thread_id: string;
      confirmed_at: string;
      created_at: string;
    } | null;
    application_updated: boolean;
  }>("/api/v1/suggestions/confirm", {
    method: "POST",
    body: JSON.stringify({
      application_id,
      gmail_thread_id,
      field_updates: options?.field_updates,
      link_thread: options?.link_thread ?? true,
    }),
  });
}

export async function getResumes() {
  const data = await request<{ resumes: ResumeVersion[] }>("/api/v1/resumes");
  return data.resumes ?? [];
}

export function uploadResume(input: {
  filename: string;
  content_base64: string;
  mime_type?: string;
  label?: string;
  notes?: string;
}) {
  return request<ResumeVersion>("/api/v1/resumes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteResume(id: string) {
  return request<void>(`/api/v1/resumes/${id}`, { method: "DELETE" });
}

export function patchResumeLabel(id: string, label: string) {
  return request<ResumeVersion>(`/api/v1/resumes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export function resumeFileUrl(id: string) {
  return `/api/v1/resumes/${id}/file`;
}
