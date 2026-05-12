import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  confirmGmailSuggestion,
  getApplications,
  getGmailOAuthStartUrl,
  getGmailStatus,
  postGmailSync,
  type Application,
  type GmailSuggestion,
  type GmailStatus,
} from "../api/client";

const card: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
};

export default function GmailPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [suggestions, setSuggestions] = useState<GmailSuggestion[]>([]);
  const [reassignFor, setReassignFor] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const appById = useMemo(() => {
    const m = new Map<string, Application>();
    for (const a of applications) m.set(a.id, a);
    return m;
  }, [applications]);

  const refreshStatus = useCallback(async () => {
    const s = await getGmailStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    if (searchParams.get("gmail") !== "connected") return;
    setBanner("Gmail connected. You can sync when ready.");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("gmail");
        return next;
      },
      { replace: true },
    );
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
    setLoading(true);
    try {
      const result = await postGmailSync();
      setSuggestions(result.suggestions);
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

  async function handleConfirm(s: GmailSuggestion) {
    setError(null);
    setLoading(true);
    try {
      await confirmGmailSuggestion(effectiveApplicationId(s), s.gmail_thread_id);
      setSuggestions((prev) => prev.filter((x) => x.gmail_thread_id !== s.gmail_thread_id));
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss(s: GmailSuggestion) {
    setSuggestions((prev) => prev.filter((x) => x.gmail_thread_id !== s.gmail_thread_id));
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Gmail</h1>

      {banner ? (
        <p
          role="status"
          style={{
            padding: "10px 12px",
            background: "#e8f5e9",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {banner}
        </p>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "#b00020", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div style={card}>
        <p>
          <strong>Connection:</strong>{" "}
          {status?.connected ? "Connected" : "Not connected"}
        </p>
        {status?.last_sync_at ? (
          <p>
            <strong>Last sync:</strong> {new Date(status.last_sync_at).toLocaleString()}
          </p>
        ) : (
          <p>
            <strong>Last sync:</strong> never
          </p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" disabled={loading} onClick={handleConnect}>
            Connect Gmail
          </button>
          <button type="button" disabled={loading || !status?.connected} onClick={handleSync}>
            Check Gmail
          </button>
        </div>
      </div>

      <h2>Suggestions</h2>
      <p style={{ color: "#555", fontSize: 14 }}>
        Matches are heuristic. Confirm only when the thread belongs to that application. Dismiss
        removes the row until the next sync (it may reappear).
      </p>

      {suggestions.length === 0 ? (
        <p>No suggestions yet. Run &quot;Check Gmail&quot; after you have applications logged.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {suggestions.map((s) => (
            <li key={s.gmail_thread_id} style={card}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{s.subject || "(no subject)"}</strong>
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 14 }}>
                <strong>From:</strong> {s.from}
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 14, color: "#444" }}>{s.snippet}</p>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                <strong>Score:</strong> {s.score}{" "}
                <span style={{ color: "#666" }}>({s.reason_codes.join(", ")})</span>
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                <strong>Suggested application:</strong>{" "}
                {appById.get(s.application_id)?.company ?? s.application_id}
              </p>
              <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                Reassign to
                <select
                  style={{ marginLeft: 8 }}
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
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={loading} onClick={() => handleConfirm(s)}>
                  Confirm
                </button>
                <button type="button" disabled={loading} onClick={() => handleDismiss(s)}>
                  Dismiss
                </button>
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(s.gmail_thread_id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Gmail
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
