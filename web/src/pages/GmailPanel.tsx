import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GmailFieldUpdates from "../components/GmailFieldUpdates";
import {
  ApiRequestError,
  APPLICATION_STATUSES,
  confirmGmailSuggestion,
  createApplicationFromEmail,
  getApplications,
  getGmailOAuthStartUrl,
  getGmailStatus,
  postGmailSync,
  type Application,
  type ApplicationBody,
  type ApplicationStatus,
  type FieldUpdateSuggestion,
  type GmailSuggestion,
  type GmailStatus,
} from "../api/client";
import { statusFromProposedLabel } from "../statusLabels";

function defaultSelectedFields(updates?: FieldUpdateSuggestion[]): Set<string> {
  return new Set(updates?.map((u) => u.field) ?? []);
}

function buildFieldPatch(
  updates: FieldUpdateSuggestion[] | undefined,
  selected: Set<string>,
): Partial<ApplicationBody> {
  const patch: Partial<ApplicationBody> = {};
  if (!updates?.length || selected.size === 0) return patch;

  for (const row of updates) {
    if (!selected.has(row.field)) continue;
    switch (row.field) {
      case "status": {
        const status = statusFromProposedLabel(row.proposed);
        if ((APPLICATION_STATUSES as readonly string[]).includes(status)) {
          patch.status = status as ApplicationStatus;
        }
        break;
      }
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
      case "salary_min": {
        const n = Number(row.proposed);
        if (Number.isFinite(n)) patch.salary_min = n;
        break;
      }
      case "salary_max": {
        const n = Number(row.proposed);
        if (Number.isFinite(n)) patch.salary_max = n;
        break;
      }
      default:
        break;
    }
  }
  return patch;
}

export default function GmailPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [suggestions, setSuggestions] = useState<GmailSuggestion[]>([]);
  const [reassignFor, setReassignFor] = useState<Record<string, string>>({});
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const appById = useMemo(() => {
    const m = new Map<string, Application>();
    for (const a of applications) m.set(a.id, a);
    return m;
  }, [applications]);

  const initSelectedFields = useCallback((rows: GmailSuggestion[]) => {
    const next: Record<string, Set<string>> = {};
    for (const s of rows) {
      if (s.field_updates?.length) {
        next[s.gmail_thread_id] = defaultSelectedFields(s.field_updates);
      }
    }
    setSelectedFields(next);
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await getGmailStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (gmail === "connected") {
      setBanner("Gmail connected. Run a sync when you're ready.");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("gmail");
          next.delete("reason");
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (gmail === "error") {
      const reason = searchParams.get("reason");
      setError(reason ? decodeURIComponent(reason) : "Gmail connection failed.");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("gmail");
          next.delete("reason");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const [s, apps] = await Promise.all([getGmailStatus(), getApplications()]);
        if (!cancelled) {
          setStatus(s);
          setApplications(apps);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      const url = await getGmailOAuthStartUrl();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setError(null);
    setBanner(null);
    setSuggestions([]);
    setLoading(true);
    try {
      const result = await postGmailSync();
      setSuggestions(result.suggestions);
      initSelectedFields(result.suggestions);
      if (result.inbox_empty) {
        setBanner("Your Gmail inbox is empty — nothing to match right now.");
      } else if (result.ai_used) {
        setBanner("Inbox checked — review suggested links and field updates.");
      } else {
        setBanner("Inbox checked — review suggestions below.");
      }
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function effectiveApplicationId(s: GmailSuggestion): string {
    return reassignFor[s.gmail_thread_id] ?? s.application_id;
  }

  function selectedFor(s: GmailSuggestion): Set<string> {
    return selectedFields[s.gmail_thread_id] ?? defaultSelectedFields(s.field_updates);
  }

  function toggleField(threadId: string, field: string, checked: boolean) {
    setSelectedFields((prev) => {
      const cur = new Set(prev[threadId] ?? []);
      if (checked) cur.add(field);
      else cur.delete(field);
      return { ...prev, [threadId]: cur };
    });
  }

  function removeSuggestion(threadId: string) {
    setSuggestions((prev) => prev.filter((x) => x.gmail_thread_id !== threadId));
    setSelectedFields((prev) => {
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }

  async function handleConfirm(
    s: GmailSuggestion,
    options?: { linkOnly?: boolean; updatesOnly?: boolean },
  ) {
    setError(null);
    setLoading(true);
    try {
      const appId = effectiveApplicationId(s);
      if (!appId || !appById.has(appId)) {
        setError("Choose an application to link this inbox thread to.");
        return;
      }

      const patch = buildFieldPatch(s.field_updates, selectedFor(s));
      const hasUpdates = Object.keys(patch).length > 0;

      if (options?.updatesOnly && !hasUpdates) {
        setError("Select at least one field update to apply.");
        return;
      }

      await confirmGmailSuggestion(appId, s.gmail_thread_id, {
        field_updates: hasUpdates ? patch : undefined,
        link_thread: options?.updatesOnly ? false : true,
      });

      removeSuggestion(s.gmail_thread_id);
      if (hasUpdates) {
        setApplications(await getApplications());
      }
      await refreshStatus();
      const app = appById.get(appId);
      setBanner(
        hasUpdates
          ? `Updates applied and thread linked${app ? ` to ${app.company}` : ""}.`
          : `Thread linked${app ? ` to ${app.company}` : ""}.`,
      );
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        removeSuggestion(s.gmail_thread_id);
        setBanner("This thread was already linked — removed from suggestions.");
        await refreshStatus();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFromEmail(s: GmailSuggestion) {
    setError(null);
    setLoading(true);
    try {
      const created = await createApplicationFromEmail({
        from: s.from,
        subject: s.subject,
        snippet: s.snippet,
        gmail_thread_id: s.gmail_thread_id,
      });
      removeSuggestion(s.gmail_thread_id);
      setApplications(await getApplications());
      await refreshStatus();
      setBanner(
        `Created application for ${created.company} — ${created.title}. Thread linked to inbox.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss(s: GmailSuggestion) {
    removeSuggestion(s.gmail_thread_id);
  }

  return (
    <>
      <header className="page-header">
        <h1>Gmail</h1>
        <p>
          Connect Gmail and check your <strong>current inbox only</strong> (not all mail). Approve
          links and optional field updates from each message.
        </p>
      </header>

      {banner ? <div className="alert alert--success" role="status">{banner}</div> : null}
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <div className="card">
        <p style={{ margin: "0 0 4px" }}>
          <strong>Connection:</strong> {status?.connected ? "Connected" : "Not connected"}
        </p>
        <p style={{ margin: 0, color: "var(--ink-muted)" }}>
          <strong>Last sync:</strong>{" "}
          {status?.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "Never"}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" className="btn btn--primary" disabled={loading} onClick={handleConnect}>
            Connect Gmail
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={loading || !status?.connected}
            onClick={handleSync}
          >
            Check inbox
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 28, fontSize: "1.25rem" }}>Suggestions</h2>
      <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem" }}>
        Suggestions come from threads in your inbox right now. Approve field changes, link the
        thread, or both.
      </p>

      {suggestions.length === 0 ? (
        <div className="card empty-state">
          <p>
            No inbox suggestions yet. Connect Gmail and run &quot;Check inbox&quot; — if your inbox
            is empty, you&apos;ll see a message here.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
          {suggestions.map((s) => {
            const appId = effectiveApplicationId(s);
            const app = appById.get(appId);
            const hasFieldUpdates = (s.field_updates?.length ?? 0) > 0;
            const selected = selectedFor(s);
            const canLink = Boolean(appId && app && !s.propose_create);

            return (
              <li key={s.gmail_thread_id} className="card suggestion-card">
                <p style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>
                  <strong>{s.subject || "(no subject)"}</strong>
                  <span className="tag">match {s.score}</span>
                </p>
                <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>From: {s.from}</p>
                <p style={{ margin: "0 0 12px", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  {s.snippet}
                </p>
                {s.ai_summary ? (
                  <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--accent)" }}>
                    AI: {s.ai_summary}
                  </p>
                ) : null}
                {s.propose_create ? (
                  <span className="tag">AI: possible new application</span>
                ) : null}
                <p style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
                  Suggested: <strong>{app?.company ?? "Unknown"}</strong>
                  {app?.title ? ` — ${app.title}` : null}
                  {" · "}
                  <span style={{ color: "var(--ink-muted)" }}>{s.reason_codes.join(", ")}</span>
                </p>

                {hasFieldUpdates && !s.propose_create ? (
                  <GmailFieldUpdates
                    updates={s.field_updates!}
                    selected={selected}
                    onToggle={(field, checked) => toggleField(s.gmail_thread_id, field, checked)}
                  />
                ) : null}

                <label style={{ display: "block", marginBottom: 12, fontSize: "0.9rem" }}>
                  Link to application
                  <select
                    style={{ marginTop: 6 }}
                    value={reassignFor[s.gmail_thread_id] ?? s.application_id}
                    onChange={(ev) =>
                      setReassignFor((prev) => ({
                        ...prev,
                        [s.gmail_thread_id]: ev.target.value,
                      }))
                    }
                  >
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company} — {a.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {canLink && hasFieldUpdates ? (
                    <>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={loading}
                        onClick={() => handleConfirm(s)}
                      >
                        {selected.size > 0 ? "Apply updates & link" : "Link thread"}
                      </button>
                      {selected.size > 0 ? (
                        <button
                          type="button"
                          className="btn btn--secondary"
                          disabled={loading}
                          onClick={() => handleConfirm(s, { updatesOnly: true })}
                        >
                          Apply updates only
                        </button>
                      ) : null}
                    </>
                  ) : canLink ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={loading}
                      onClick={() => handleConfirm(s)}
                    >
                      Confirm link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--coral"
                    disabled={loading}
                    onClick={() => handleCreateFromEmail(s)}
                  >
                    Create application from email
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={loading}
                    onClick={() => handleDismiss(s)}
                  >
                    Dismiss
                  </button>
                  <a
                    className="btn btn--ghost"
                    href={`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(s.gmail_thread_id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Gmail
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
