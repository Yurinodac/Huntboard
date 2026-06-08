import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import ImportFromUrl from "../components/ImportFromUrl";
import {
  APPLICATION_STATUSES,
  createApplication,
  deleteApplication,
  getApplication,
  getApplicationThreads,
  getResumes,
  patchApplication,
  resumeFileUrl,
  type ApplicationBody,
  type ApplicationThread,
  type ResumeVersion,
  type WorkArrangement,
} from "../api/client";
import { statusLabel } from "../statusLabels";

type DetailTab = "details" | "mail";

type FormState = {
  company: string;
  title: string;
  applied_date: string;
  status: (typeof APPLICATION_STATUSES)[number];
  posting_url: string;
  notes: string;
  job_summary: string;
  location: string;
  work_arrangement: WorkArrangement;
  salary_min: string;
  salary_max: string;
  contact_name: string;
  contact_email: string;
  file_links_text: string;
  resume_version_id: string;
};

const EMPTY_FORM: FormState = {
  company: "",
  title: "",
  applied_date: new Date().toISOString().slice(0, 10),
  status: "applied",
  posting_url: "",
  notes: "",
  job_summary: "",
  location: "",
  work_arrangement: "unknown",
  salary_min: "",
  salary_max: "",
  contact_name: "",
  contact_email: "",
  file_links_text: "",
  resume_version_id: "",
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
  job_summary?: string | null;
  location?: string | null;
  work_arrangement?: WorkArrangement | null;
  salary_min?: number | null;
  salary_max?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  file_links?: string[] | string | null;
  resume_version_id?: string | null;
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
    status:
      String(data.status) === "interested"
        ? "applied"
        : ((data.status as (typeof APPLICATION_STATUSES)[number]) ?? "applied"),
    posting_url: data.posting_url ?? "",
    notes: data.notes ?? "",
    job_summary: data.job_summary ?? "",
    location: data.location ?? "",
    work_arrangement: data.work_arrangement ?? "unknown",
    salary_min: data.salary_min == null ? "" : String(data.salary_min),
    salary_max: data.salary_max == null ? "" : String(data.salary_max),
    contact_name: data.contact_name ?? "",
    contact_email: data.contact_email ?? "",
    file_links_text: links.join("\n"),
    resume_version_id: data.resume_version_id ?? "",
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

function bodyToFormState(body: ApplicationBody): FormState {
  return {
    company: body.company ?? "",
    title: body.title ?? "",
    applied_date: body.applied_date ?? new Date().toISOString().slice(0, 10),
    status: body.status ?? "applied",
    posting_url: body.posting_url ?? "",
    notes: body.notes ?? "",
    job_summary: body.job_summary ?? "",
    location: body.location ?? "",
    work_arrangement: body.work_arrangement ?? "unknown",
    salary_min: body.salary_min == null ? "" : String(body.salary_min),
    salary_max: body.salary_max == null ? "" : String(body.salary_max),
    contact_name: body.contact_name ?? "",
    contact_email: body.contact_email ?? "",
    file_links_text: (body.file_links ?? []).join("\n"),
    resume_version_id: body.resume_version_id ?? "",
  };
}

function toPayload(form: FormState): ApplicationBody {
  return {
    company: form.company.trim(),
    title: form.title.trim(),
    applied_date: form.applied_date.trim() || undefined,
    status: form.status,
    posting_url: form.posting_url.trim() || undefined,
    notes: form.notes.trim() || undefined,
    job_summary: form.job_summary.trim() || undefined,
    location: form.location.trim() || undefined,
    work_arrangement: form.work_arrangement,
    salary_min: form.salary_min.trim() ? Number(form.salary_min) : undefined,
    salary_max: form.salary_max.trim() ? Number(form.salary_max) : undefined,
    contact_name: form.contact_name.trim() || undefined,
    contact_email: form.contact_email.trim() || undefined,
    file_links: normalizeLinks(form.file_links_text),
    resume_version_id: form.resume_version_id.trim() || null,
  };
}

export default function ApplicationDetail() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<DetailTab>("details");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ApplicationThread[]>([]);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [deleting, setDeleting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    getResumes()
      .then(setResumes)
      .catch(() => setResumes([]));
  }, []);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      const state = location.state as { draft?: ApplicationBody; importWarnings?: string[] } | null;
      if (state?.draft) {
        setForm(bodyToFormState(state.draft));
        setImportNote("Imported from job link — review and save.");
        setImportWarnings(state.importWarnings ?? []);
      } else {
        setForm(EMPTY_FORM);
      }
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
  }, [id, isNew, location.state]);

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
    if (submitLock.current) return;
    submitLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      if (isNew) {
        await createApplication(payload);
      } else {
        await patchApplication(id, payload);
      }
      navigate("/applications");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    const label = [form.company, form.title].filter(Boolean).join(" — ") || "this application";
    if (
      !window.confirm(
        `Delete ${label}? This cannot be undone. Linked Gmail threads will be unlinked.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteApplication(id);
      navigate("/applications");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p>Loading application…</p>;
  }

  return (
    <>
      <header
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <p style={{ margin: "0 0 8px 0" }}>
            <Link to="/applications">← Applications</Link>
          </p>
          <h1 style={{ margin: 0 }}>{pageTitle}</h1>
        </div>
        {!isNew ? (
          <button
            type="button"
            className="btn btn--coral"
            disabled={deleting || saving}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete application"}
          </button>
        ) : null}
      </header>

      {isNew ? (
        <ImportFromUrl
          onImported={(preview, sources, warnings) => {
            setForm(
              bodyToFormState({
                ...preview,
                applied_date: preview.applied_date ?? new Date().toISOString().slice(0, 10),
              }),
            );
            setImportNote(`Imported (${sources.join(", ")}) — review and save.`);
            setImportWarnings(warnings);
          }}
        />
      ) : null}

      {importNote ? <div className="alert alert--success">{importNote}</div> : null}
      {importWarnings.map((w) => (
        <div key={w} className="alert alert--warn">
          {w}
        </div>
      ))}

      <nav className="tabs" aria-label="Application sections">
        <button
          type="button"
          className={`tab${tab === "details" ? " tab--active" : ""}`}
          onClick={() => setTab("details")}
          aria-pressed={tab === "details"}
        >
          Details
        </button>
        <button
          type="button"
          className={`tab${tab === "mail" ? " tab--active" : ""}`}
          onClick={() => setTab("mail")}
          aria-pressed={tab === "mail"}
        >
          Mail
        </button>
      </nav>

      {tab === "details" ? (
        <form onSubmit={onSubmit} className="card form-grid">
          {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

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
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Resume used">
            <select
              value={form.resume_version_id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, resume_version_id: event.target.value }))}
            >
              <option value="">— None —</option>
              {resumes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label} ({new Date(row.uploaded_at).toLocaleDateString()})
                </option>
              ))}
            </select>
            <p className="field-hint">
              <Link to="/resumes">Upload resume versions</Link> to track which file you sent.
              {form.resume_version_id ? (
                <>
                  {" "}
                  <a
                    href={resumeFileUrl(form.resume_version_id)}
                    download
                    onClick={(event) => event.stopPropagation()}
                  >
                    Download selected
                  </a>
                </>
              ) : null}
            </p>
          </Field>

          <Field label="Job posting link">
            <PostingUrlField
              isNew={isNew}
              value={form.posting_url}
              onChange={(posting_url) => setForm((prev) => ({ ...prev, posting_url }))}
            />
          </Field>

          <Field label="Job description summary">
            <textarea
              rows={10}
              value={form.job_summary}
              onChange={(event) => setForm((prev) => ({ ...prev, job_summary: event.target.value }))}
              placeholder="Imported from the posting, or paste the role description here…"
            />
            <p className="field-hint">Main duties, requirements, and context for this role.</p>
          </Field>

          <Field label="Your notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Interview prep, referrals, salary thoughts…"
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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Link to="/applications" className="btn btn--secondary">
              Cancel
            </Link>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Add to pipeline" : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <section className="card" aria-live="polite">
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
    </>
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
    <div className="field">
      <label>
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

function normalizePostingHref(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function displayPostingLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(normalizePostingHref(url));
    const path = pathname.length > 48 ? `${pathname.slice(0, 45)}…` : pathname;
    return `${hostname}${path === "/" ? "" : path}`;
  } catch {
    return url.trim();
  }
}

function PostingUrlField({
  isNew,
  value,
  onChange,
}: {
  isNew: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [isNew]);

  const trimmed = value.trim();
  const href = normalizePostingHref(trimmed);

  if (isNew || editing) {
    return (
      <div className="posting-url-field">
        <input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          autoFocus={editing}
        />
        {!isNew && editing ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setEditing(false)}
          >
            Done
          </button>
        ) : null}
      </div>
    );
  }

  if (!trimmed) {
    return (
      <div className="posting-url-field posting-url-field--link">
        <span className="posting-url-empty">No posting link</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add job posting link"
          title="Add link"
          onClick={() => setEditing(true)}
        >
          <EditIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="posting-url-field posting-url-field--link">
      <a
        className="posting-url-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={trimmed}
      >
        {displayPostingLabel(trimmed)}
      </a>
      <button
        type="button"
        className="icon-btn"
        aria-label="Edit job posting link"
        title="Edit link"
        onClick={() => setEditing(true)}
      >
        <EditIcon />
      </button>
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
