import type Database from "better-sqlite3";

const CSV_COLUMNS = [
  "id",
  "company",
  "title",
  "status",
  "source",
  "applied_date",
  "first_interview_at",
  "offer_at",
  "rejected_at",
  "location",
  "work_arrangement",
  "salary_min",
  "salary_max",
  "posting_url",
  "contact_name",
  "contact_email",
  "resume_version_id",
  "created_at",
  "updated_at",
] as const;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function applicationsToCsv(db: Database.Database): string {
  const rows = db
    .prepare(
      `SELECT id, company, title, status, source, applied_date, first_interview_at, offer_at,
              rejected_at, location, work_arrangement, salary_min, salary_max, posting_url,
              contact_name, contact_email, resume_version_id, created_at, updated_at
       FROM applications
       ORDER BY applied_date DESC, created_at DESC`,
    )
    .all() as Record<string, unknown>[];

  const header = CSV_COLUMNS.join(",");
  const body = rows
    .map((row) => CSV_COLUMNS.map((col) => escapeCsvCell(row[col])).join(","))
    .join("\r\n");
  return `${header}\r\n${body}\r\n`;
}
