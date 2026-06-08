import { getClaudeApiKey, isClaudeEnabled, CLAUDE_MODEL } from "../config.js";

export type JobDraftFromAi = {
  company: string;
  title: string;
  job_summary?: string;
  location?: string;
  work_arrangement?: "remote" | "hybrid" | "onsite" | "unknown";
  notes?: string;
  salary_min?: number;
  salary_max?: number;
};

export type GmailAiSuggestion = {
  gmail_thread_id: string;
  application_id: string | null;
  confidence: number;
  summary: string;
  create_application?: JobDraftFromAi;
  application_updates?: {
    status?: "applied" | "pre_assessment" | "recruiter_screen" | "interview" | "offer" | "rejected" | "withdrawn" | "archived";
    applied_date?: string;
    contact_name?: string;
    contact_email?: string;
    location?: string;
    notes?: string;
  };
};

function extractTextFromResponse(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        return String((block as { text?: string }).text ?? "");
      }
      return "";
    })
    .join("\n")
    .trim();
}

export function parseJsonFromClaudeText<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function claudeMessages(system: string, user: string): Promise<string | null> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as unknown;
    return extractTextFromResponse(data);
  } finally {
    clearTimeout(timeout);
  }
}

export async function refineJobPostingWithAi(input: {
  url: string;
  heuristic: JobDraftFromAi;
  pageExcerpt: string;
}): Promise<JobDraftFromAi | null> {
  if (!isClaudeEnabled()) return null;

  const system = `You extract structured job application data for a personal job tracker.
Respond with ONLY valid JSON (no markdown) matching:
{"company":"string","title":"string","job_summary":"string (full role description, responsibilities, requirements)","location":"string or empty","work_arrangement":"remote|hybrid|onsite|unknown","notes":"string or empty","salary_min":number or null,"salary_max":number or null}
Use the posting URL and page text. For salary_min/salary_max use explicit annual USD amounts, or annualize stated hourly rates at 2080 hrs/year; otherwise null.`;

  const user = `URL: ${input.url}

Heuristic parse (may be wrong):
${JSON.stringify(input.heuristic, null, 2)}

Page text excerpt:
${input.pageExcerpt.slice(0, 12_000)}`;

  const text = await claudeMessages(system, user);
  if (!text) return null;
  const parsed = parseJsonFromClaudeText<JobDraftFromAi>(text);
  if (!parsed?.company || !parsed?.title) return null;
  return parsed;
}

export async function refineEmailToApplicationWithAi(input: {
  from: string;
  subject: string;
  snippet?: string;
}): Promise<JobDraftFromAi | null> {
  if (!isClaudeEnabled()) return null;

  const system = `You extract job application fields from recruiter email metadata.
Return ONLY JSON: {"company","title","job_summary","location","work_arrangement","notes"}`;

  const user = `From: ${input.from}
Subject: ${input.subject}
Snippet: ${input.snippet ?? ""}`;

  const text = await claudeMessages(system, user);
  if (!text) return null;
  return parseJsonFromClaudeText<JobDraftFromAi>(text);
}

export async function enhanceGmailSuggestionsWithAi(input: {
  applications: Array<{ id: string; company: string; title: string }>;
  threads: Array<{
    gmail_thread_id: string;
    from: string;
    subject: string;
    snippet: string;
    heuristic_application_id: string | null;
    heuristic_score: number;
  }>;
}): Promise<GmailAiSuggestion[] | null> {
  if (!isClaudeEnabled() || input.threads.length === 0) return null;

  const system = `You help match recruiting emails to job applications and suggest safe field updates.
Return ONLY JSON array (max 15 items):
[{"gmail_thread_id":"...","application_id":"uuid or null","confidence":0-1,"summary":"one sentence","create_application":null or {"company","title",...},"application_updates":null or {"status":"applied|pre_assessment|recruiter_screen|interview|offer|rejected|...","applied_date":"YYYY-MM-DD","contact_name":"","contact_email":"","location":"","notes":"append-only summary line"}}]
Pick application_id from the list when clearly the same company/role. application_updates only when email clearly implies a change (e.g. interview invite → interview, rejection → rejected). For rejections use status "rejected" when the email says they won't proceed, chose other candidates, not moving forward, etc. notes should be a single line to append, not repeat the whole thread.`;

  const user = `Applications:
${JSON.stringify(input.applications.slice(0, 40), null, 2)}

Email threads:
${JSON.stringify(input.threads.slice(0, 20), null, 2)}`;

  const text = await claudeMessages(system, user);
  if (!text) return null;
  const parsed = parseJsonFromClaudeText<GmailAiSuggestion[]>(text);
  return Array.isArray(parsed) ? parsed : null;
}

export async function suggestApplicationFieldUpdatesWithAi(input: {
  application: {
    company: string;
    title: string;
    status: string;
    applied_date?: string | null;
    notes?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    location?: string | null;
  };
  from: string;
  subject: string;
  snippet: string;
}): Promise<GmailAiSuggestion["application_updates"] | null> {
  if (!isClaudeEnabled()) return null;

  const system = `You suggest job application field updates from a recruiting email.
Return ONLY JSON:
{"status":null or one of applied|pre_assessment|recruiter_screen|interview|offer|rejected|withdrawn|archived,
"applied_date":null or "YYYY-MM-DD",
"contact_name":null or string,
"contact_email":null or string,
"location":null or string,
"notes":null or one short line to append to notes (include date context)}
Only include fields the email clearly supports. Do not change company or title. Set status to rejected for rejection letters (other candidates, not proceeding, not moving forward).`;

  const user = `Current application:
${JSON.stringify(input.application, null, 2)}

Email:
From: ${input.from}
Subject: ${input.subject}
Snippet: ${input.snippet}`;

  const text = await claudeMessages(system, user);
  if (!text) return null;
  return parseJsonFromClaudeText<GmailAiSuggestion["application_updates"]>(text);
}
