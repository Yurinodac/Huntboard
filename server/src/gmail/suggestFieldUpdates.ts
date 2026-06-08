import { isRejectionEmail } from "./detectRejection.js";
import { extractApplicationFromEmail } from "../import/extractFromEmail.js";
import { extractSalaryRange } from "../import/extractSalary.js";
import type { ApplicationStatusValue } from "../types/application.js";

export type ApplicationSnapshot = {
  id: string;
  company: string;
  title: string;
  status: ApplicationStatusValue;
  applied_date?: string | null;
  notes?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
};

export type FieldUpdateSuggestion = {
  field: string;
  label: string;
  current: string | null;
  proposed: string;
  reason: string;
};

export type EmailThreadInput = {
  from: string;
  subject: string;
  snippet: string;
};

const STATUS_ORDER: ApplicationStatusValue[] = [
  "applied",
  "pre_assessment",
  "recruiter_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
];

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function statusRank(status: ApplicationStatusValue): number {
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 ? i : 0;
}

export function inferStatusFromEmail(
  subject: string,
  snippet: string,
): ApplicationStatusValue | null {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/\b(offer letter|we are pleased to offer|extend an offer)\b/.test(text)) {
    return "offer";
  }
  if (isRejectionEmail(subject, snippet)) {
    return "rejected";
  }
  if (
    /\b(pre[- ]?employment assessment|preliminary assessment|skills? assessment|online assessment|complete (?:the |your )?assessment|take[- ]home (?:assignment|test|challenge)|coding (?:challenge|assessment)|hackerrank|codility|testgorilla|qualified\.io|karat interview)\b/.test(
      text,
    )
  ) {
    return "pre_assessment";
  }
  if (
    /\b(interview|onsite|on-site|phone screen|technical screen|schedule.*call|meet (?:with|the team))\b/.test(
      text,
    )
  ) {
    return "interview";
  }
  if (/\b(recruiter screen|initial screen|talent screen|hiring manager screen)\b/.test(text)) {
    return "recruiter_screen";
  }
  if (/\b(thanks for applying|application received|we received your application)\b/.test(text)) {
    return "applied";
  }
  return null;
}

function formatStatusLabel(status: ApplicationStatusValue): string {
  if (status === "pre_assessment") return "Pre-assessment";
  return status.replace(/_/g, " ");
}

function parseStatusProposed(proposed: string): ApplicationStatusValue {
  const key = proposed.trim().toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  if ((STATUS_ORDER as string[]).includes(key)) {
    return key as ApplicationStatusValue;
  }
  return proposed.replace(/\s+/g, "_") as ApplicationStatusValue;
}

function buildNotesAppend(subject: string, snippet: string, syncedAt?: string): string {
  const date = syncedAt ? syncedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const subj = subject.trim() || "(no subject)";
  const body = snippet.trim().slice(0, 280);
  return `[${date}] Gmail: ${subj}${body ? ` — ${body}` : ""}`;
}

export type ProposedPatch = {
  status?: ApplicationStatusValue;
  applied_date?: string;
  contact_name?: string;
  contact_email?: string;
  location?: string;
  notes?: string;
  salary_min?: number;
  salary_max?: number;
};

export function buildFieldUpdateSuggestions(
  app: ApplicationSnapshot,
  email: EmailThreadInput,
  syncedAt?: string,
): FieldUpdateSuggestion[] {
  const extracted = extractApplicationFromEmail(email);
  const inferredStatus = inferStatusFromEmail(email.subject, email.snippet);
  const suggestions: FieldUpdateSuggestion[] = [];

  if (inferredStatus && inferredStatus !== app.status) {
    const forward =
      inferredStatus === "rejected" ||
      statusRank(inferredStatus) > statusRank(app.status);
    if (forward) {
      suggestions.push({
        field: "status",
        label: "Status",
        current: formatStatusLabel(app.status),
        proposed: formatStatusLabel(inferredStatus),
        reason: "Inferred from email wording",
      });
    }
  }

  if (!norm(app.contact_email) && extracted.contact_email) {
    suggestions.push({
      field: "contact_email",
      label: "Contact email",
      current: null,
      proposed: extracted.contact_email,
      reason: "From sender address",
    });
  }

  if (!norm(app.contact_name) && extracted.contact_name) {
    suggestions.push({
      field: "contact_name",
      label: "Contact name",
      current: null,
      proposed: extracted.contact_name,
      reason: "From sender display name",
    });
  }

  const notesAppend = buildNotesAppend(email.subject, email.snippet, syncedAt);
  const existingNotes = norm(app.notes);
  if (!existingNotes.includes(notesAppend.slice(0, 40))) {
    const proposedNotes = existingNotes
      ? `${existingNotes}\n\n${notesAppend}`
      : notesAppend;
    suggestions.push({
      field: "notes",
      label: "Notes",
      current: existingNotes || null,
      proposed: proposedNotes,
      reason: "Append email summary",
    });
  }

  if (inferredStatus === "applied" && !norm(app.applied_date)) {
    const proposed = syncedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    suggestions.push({
      field: "applied_date",
      label: "Applied date",
      current: null,
      proposed,
      reason: "Set from application confirmation email",
    });
  }

  const emailText = `${email.subject}\n${email.snippet}`;
  const salary = extractSalaryRange(emailText);
  if (salary) {
    const salaryReason = salary.salary_disclosure
      ? "Hourly rate in email (annualized)"
      : "Salary range in email";
    if (app.salary_min == null) {
      suggestions.push({
        field: "salary_min",
        label: "Salary min",
        current: null,
        proposed: String(salary.salary_min),
        reason: salaryReason,
      });
    }
    if (app.salary_max == null) {
      suggestions.push({
        field: "salary_max",
        label: "Salary max",
        current: null,
        proposed: String(salary.salary_max),
        reason: salaryReason,
      });
    }
    if (salary.salary_disclosure) {
      const existingNotes = norm(app.notes);
      const marker = salary.salary_disclosure.slice(0, 32);
      if (!existingNotes.includes(marker)) {
        const notesIdx = suggestions.findIndex((s) => s.field === "notes");
        if (notesIdx >= 0) {
          const row = suggestions[notesIdx];
          if (!row.proposed.includes(marker)) {
            suggestions[notesIdx] = {
              ...row,
              proposed: `${row.proposed}\n\n${salary.salary_disclosure}`,
              reason: `${row.reason}; hourly disclosure`,
            };
          }
        } else {
          suggestions.push({
            field: "notes",
            label: "Notes",
            current: existingNotes || null,
            proposed: existingNotes
              ? `${existingNotes}\n\n${salary.salary_disclosure}`
              : salary.salary_disclosure,
            reason: "Note that pay was posted hourly",
          });
        }
      }
    }
  }

  return suggestions;
}

export function patchFromFieldUpdates(
  updates: FieldUpdateSuggestion[],
  selectedFields: Set<string>,
): ProposedPatch {
  const patch: ProposedPatch = {};
  for (const row of updates) {
    if (!selectedFields.has(row.field)) continue;
    switch (row.field) {
      case "status":
        patch.status = parseStatusProposed(row.proposed);
        break;
      case "applied_date":
        patch.applied_date = row.proposed;
        break;
      case "contact_name":
        patch.contact_name = row.proposed;
        break;
      case "contact_email":
        patch.contact_email = row.proposed;
        break;
      case "location":
        patch.location = row.proposed;
        break;
      case "notes":
        patch.notes = row.proposed;
        break;
      case "salary_min":
        patch.salary_min = Number(row.proposed);
        break;
      case "salary_max":
        patch.salary_max = Number(row.proposed);
        break;
      default:
        break;
    }
  }
  return patch;
}

export function mergeAiFieldSuggestions(
  base: FieldUpdateSuggestion[],
  app: ApplicationSnapshot,
  ai: ProposedPatch | null | undefined,
): FieldUpdateSuggestion[] {
  if (!ai) return base;
  const byField = new Map(base.map((s) => [s.field, s]));

  const add = (row: FieldUpdateSuggestion) => {
    const cur = norm(
      row.field === "status"
        ? formatStatusLabel(app.status)
        : (app[row.field as keyof ApplicationSnapshot] as string | null),
    );
    if (row.proposed === cur) return;
    byField.set(row.field, row);
  };

  if (ai.status && ai.status !== app.status) {
    add({
      field: "status",
      label: "Status",
      current: formatStatusLabel(app.status),
      proposed: formatStatusLabel(ai.status),
      reason: "AI inferred from email",
    });
  }
  if (ai.contact_email && !norm(app.contact_email)) {
    add({
      field: "contact_email",
      label: "Contact email",
      current: null,
      proposed: ai.contact_email,
      reason: "AI extracted from email",
    });
  }
  if (ai.contact_name && !norm(app.contact_name)) {
    add({
      field: "contact_name",
      label: "Contact name",
      current: null,
      proposed: ai.contact_name,
      reason: "AI extracted from email",
    });
  }
  if (ai.location && !norm(app.location)) {
    add({
      field: "location",
      label: "Location",
      current: null,
      proposed: ai.location,
      reason: "AI extracted from email",
    });
  }
  if (ai.applied_date && !norm(app.applied_date)) {
    add({
      field: "applied_date",
      label: "Applied date",
      current: null,
      proposed: ai.applied_date,
      reason: "AI inferred from email",
    });
  }
  if (ai.notes) {
    const existingNotes = norm(app.notes);
    const proposed = existingNotes ? `${existingNotes}\n\n${ai.notes}` : ai.notes;
    if (proposed !== existingNotes && !existingNotes.includes(ai.notes.slice(0, 40))) {
      add({
        field: "notes",
        label: "Notes",
        current: existingNotes || null,
        proposed,
        reason: "AI summary from email",
      });
    }
  }

  return [...byField.values()];
}
