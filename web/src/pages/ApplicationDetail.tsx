import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  APPLICATION_STATUSES,
  createApplication,
  getApplication,
  getApplicationThreads,
  patchApplication,
  type ApplicationBody,
  type ApplicationThread,
  type WorkArrangement,
} from "../api/client";

type DetailTab = "details" | "mail";

type FormState = {
  company: string;
  title: string;
  applied_date: string;
  status: (typeof APPLICATION_STATUSES)[number];
  posting_url: string;
  notes: string;
  location: string;
  work_arrangement: WorkArrangement;
  salary_min: string;
  salary_max: string;
  contact_name: string;
  contact_email: string;
  file_links_text: string;
};

const EMPTY_FORM: FormState = {
  company: "",
  title: "",
  applied_date: "",
  status: "interested",
  posting_url: "",
  notes: "",
  location: "",
  work_arrangement: "unknown",
  salary_min: "",
  salary_max: "",
  contact_name: "",
  contact_email: "",
  file_links_text: "",
};

const WORK_ARRANGEMENTS: WorkArrangement[] = ["unknown", "remote", "hybrid", "onsite"];

function normalizeLinks(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toFormState(data: {
  company: string;
  title: string;
  applied_date?: string | null;
  status: (typeof APPLICATION_STATUSES)[number];
  posting_url?: string | null;
  notes?: string | null;
  location?: string | null;
  work_arrangement?: WorkArrangement | null;
  salary_min?: number | null;
  salary_max?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  file_links?: string[] | string | null;
}): FormState {
  const links = Array.isArray(data.file_links)
    ? data.file_links
    : typeof data.file_links === "string"
      ? parseLinksJson(data.file_links)
      : [];
  return {
    company: data.company ?? "",
    title: data.title ?? "",
    applied_date: data.applied_date ?? "",
    status: data.status ?? "interested",
    posting_url: data.posting_url ?? "",
    notes: data.notes ?? "",
    location: data.location ?? "",
    work_arrangement: data.work_arrangement ?? "unknown",
    salary_min: data.salary_min == null ? "" : String(data.salary_min),
    salary_max: data.salary_max == null ? "" : String(data.salary_max),
    contact_name: data.contact_name ?? "",
    contact_email: data.contact_email ?? "",
    file_links_text: links.join("\n"),
  };
}

function parseLinksJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toPayload(form: FormState): ApplicationBody {
  return {
    company: form.company.trim(),
    title: form.title.trim(),
    applied_date: form.applied_date.trim() || undefined,
    status: form.status,
    posting_url: form.posting_url.trim() || undefined,
    notes: form.notes.trim() || undefined,
    location: form.location.trim() || undefined,
    work_arrangement: form.work_arrangement,
    salary_min: form.salary_min.trim() ? Number(form.salary_min) : undefined,
    salary_max: form.salary_max.trim() ? Number(form.salary_max) : undefined,
    contact_name: form.contact_name.trim() || undefined,
    contact_email: form.contact_email.trim() || undefined,
    file_links: normalizeLinks(form.file_links_text),
  };
}

export default function ApplicationDetail() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>("details");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ApplicationThread[]>([]);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      setForm(EMPTY_FORM);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);
    getApplication(id)
      .then((data) => {
        if (!alive) return;
        setForm(toFormState(data));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load application");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, isNew]);

  useEffect(() => {
    if (tab !== "mail" || isNew) return;
    let alive = true;
    setMailLoading(true);
    setMailError(null);
    getApplicationThreads(id)
      .then((rows) => {
        if (alive) setThreads(rows);
      })
      .catch((err: unknown) => {
        if (alive) setMailError(err instanceof Error ? err.message : "Failed to load mail threads");
      })
      .finally(() => {
        if (alive) setMailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, isNew, tab]);

  const pageTitle = useMemo(() => (isNew ? "New application" : "Application details"), [isNew]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      if (isNew) {
        const created = await createApplication(payload);
        navigate(`/applications/${created.id}`);
      } else {
        await patchApplication(id, payload);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main style={mainStyle}>Loading application...</main>;
  }

  return (
    <main style={mainStyle}>
      <header style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px 0" }}>
          <Link to="/applications">Back to applications</Link>
        </p>
        <h1 style={{ margin: 0 }}>{pageTitle}</h1>
      </header>

      <nav aria-label="Application sections" style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setTab("details")}
          aria-pressed={tab === "details"}
          style={tabButtonStyle(tab === "details")}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setTab("mail")}
          aria-pressed={tab === "mail"}
          style={tabButtonStyle(tab === "mail")}
        >
          Mail
        </button>
      </nav>

      {tab === "details" ? (
        <form onSubmit={onSubmit} style={formStyle}>
          {error ? <p role="alert">{error}</p> : null}

          <Field label="Company" required>
            <input
              value={form.company}
              onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
              required
            />
          </Field>

          <Field label="Title" required>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </Field>

          <Field label="Applied date">
            <input
              type="date"
              value={form.applied_date}
              onChange={(event) => setForm((prev) => ({ ...prev, applied_date: event.target.value }))}
            />
          </Field>

          <Field label="Status" required>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as (typeof APPLICATION_STATUSES)[number],
                }))}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Posting URL">
            <input
              type="url"
              value={form.posting_url}
              onChange={(event) => setForm((prev) => ({ ...prev, posting_url: event.target.value }))}
            />
          </Field>

          <Field label="Notes">
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Field>

          <Field label="Location">
            <input
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            />
          </Field>

          <Field label="Work arrangement">
            <select
              value={form.work_arrangement}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  work_arrangement: event.target.value as WorkArrangement,
                }))}
            >
              {WORK_ARRANGEMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Salary min">
            <input
              type="number"
              value={form.salary_min}
              onChange={(event) => setForm((prev) => ({ ...prev, salary_min: event.target.value }))}
            />
          </Field>

          <Field label="Salary max">
            <input
              type="number"
              value={form.salary_max}
              onChange={(event) => setForm((prev) => ({ ...prev, salary_max: event.target.value }))}
            />
          </Field>

          <Field label="Contact name">
            <input
              value={form.contact_name}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))}
            />
          </Field>

          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
            />
          </Field>

          <Field label="File links (one per line)">
            <textarea
              rows={5}
              value={form.file_links_text}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, file_links_text: event.target.value }))}
            />
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <section aria-live="polite">
          {isNew ? (
            <p>Save this application first to view linked mail threads.</p>
          ) : (
            <>
              {mailLoading ? <p>Loading mail threads...</p> : null}
              {mailError ? <p role="alert">{mailError}</p> : null}
              {!mailLoading && !mailError ? (
                threads.length === 0 ? (
                  <p>No linked threads yet.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                    {threads.map((thread) => (
                      <li
                        key={thread.threadId}
                        style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12 }}
                      >
                        <p style={{ margin: "0 0 6px 0" }}>
                          <strong>{thread.subject ?? "(no subject)"}</strong>
                        </p>
                        <p style={{ margin: "0 0 6px 0" }}>Thread: {thread.threadId}</p>
                        <p style={{ margin: "0 0 6px 0" }}>{thread.snippet ?? ""}</p>
                        <p style={{ margin: "0 0 10px 0" }}>
                          {thread.fromDisplay ?? thread.fromEmail ?? "Unknown sender"}
                        </p>
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${thread.threadId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Gmail
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          )}
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

const mainStyle: CSSProperties = {
  padding: 16,
  maxWidth: 900,
  margin: "0 auto",
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 12,
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    border: "1px solid #ccc",
    borderRadius: 6,
    padding: "8px 12px",
    background: active ? "#e7f3ff" : "#fff",
  };
}
