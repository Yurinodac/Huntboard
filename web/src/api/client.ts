export const APPLICATION_STATUSES = [
  "interested",
  "applied",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";

export type Application = {
  id: string;
  company: string;
  title: string;
  applied_date?: string | null;
  status: ApplicationStatus;
  posting_url?: string | null;
  notes?: string | null;
  location?: string | null;
  work_arrangement: WorkArrangement;
  salary_min?: number | null;
  salary_max?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  file_links: string[] | string;
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
  location?: string;
  work_arrangement?: WorkArrangement;
  salary_min?: number;
  salary_max?: number;
  contact_name?: string;
  contact_email?: string;
  file_links?: string[];
};

export type ApplicationThread = {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  fromDisplay?: string | null;
  fromEmail?: string | null;
  placeholder?: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
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
