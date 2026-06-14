import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiRequestError,
  deleteResume,
  getResumes,
  patchResumeLabel,
  resumeFileUrl,
  uploadResume,
  type ResumeVersion,
} from "../api/client";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  async function refresh() {
    setResumes(await getResumes());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const rows = await getResumes();
        if (!cancelled) setResumes(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a resume file to upload.");
      return;
    }
    setError(null);
    setBanner(null);
    setUploading(true);
    try {
      const content_base64 = await fileToBase64(file);
      await uploadResume({
        filename: file.name,
        content_base64,
        mime_type: file.type || undefined,
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setLabel("");
      setNotes("");
      setFile(null);
      await refresh();
      setBanner("Resume version saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(row: ResumeVersion) {
    if (!window.confirm(`Delete "${row.label}"? Applications using it will keep their link until you change them.`)) {
      return;
    }
    setError(null);
    try {
      await deleteResume(row.id);
      await refresh();
      setBanner("Resume version removed.");
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        setError("This resume is linked to one or more applications. Pick a different resume on those applications first.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  function startEditLabel(row: ResumeVersion) {
    setEditingId(row.id);
    setEditLabel(row.label);
    setError(null);
  }

  function cancelEditLabel() {
    setEditingId(null);
    setEditLabel("");
  }

  async function saveEditLabel(row: ResumeVersion) {
    const trimmed = editLabel.trim();
    if (!trimmed) {
      setError("Label cannot be empty.");
      return;
    }
    if (trimmed === row.label) {
      cancelEditLabel();
      return;
    }
    setSavingLabel(true);
    setError(null);
    try {
      await patchResumeLabel(row.id, trimmed);
      await refresh();
      cancelEditLabel();
      setBanner("Resume label updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingLabel(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Resumes</h1>
        <p>
          Upload and date-stamp resume versions. On each application you can choose which version you
          used.
        </p>
      </header>

      {banner ? <div className="alert alert--success" role="status">{banner}</div> : null}
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <form className="card" onSubmit={handleUpload} style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Upload new version</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          Label (optional)
          <input
            type="text"
            value={label}
            placeholder="e.g. SWE — March 2026"
            onChange={(e) => setLabel(e.target.value)}
            style={{ marginTop: 6, width: "100%" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Notes (optional)
          <textarea
            value={notes}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            style={{ marginTop: 6, width: "100%" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          File
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ marginTop: 6, display: "block" }}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={uploading || !file}>
          {uploading ? "Uploading…" : "Upload resume"}
        </button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : resumes.length === 0 ? (
        <div className="card empty-state">
          <p>No resume versions yet. Upload your first one above.</p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
          {resumes.map((row) => (
            <li key={row.id} className="card">
              {editingId === row.id ? (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: "0.9rem", marginBottom: 6 }}>
                    Label
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      autoFocus
                      disabled={savingLabel}
                      style={{ marginTop: 6, width: "100%" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveEditLabel(row);
                        }
                        if (e.key === "Escape") cancelEditLabel();
                      }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={savingLabel || !editLabel.trim()}
                      onClick={() => void saveEditLabel(row)}
                    >
                      {savingLabel ? "Saving…" : "Save label"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={savingLabel}
                      onClick={cancelEditLabel}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "0 0 4px", fontSize: "1.05rem" }}>
                  <strong>{row.label}</strong>
                </p>
              )}
              <p style={{ margin: "0 0 8px", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                Uploaded {new Date(row.uploaded_at).toLocaleString()} · {row.original_filename}
              </p>
              {row.notes ? (
                <p style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>{row.notes}</p>
              ) : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn btn--secondary" href={resumeFileUrl(row.id)} download>
                  Download
                </a>
                {editingId !== row.id ? (
                  <button type="button" className="btn btn--ghost" onClick={() => startEditLabel(row)}>
                    Rename
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost" onClick={() => handleDelete(row)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 20, fontSize: "0.9rem", color: "var(--ink-muted)" }}>
        Assign a resume on any <Link to="/applications">application</Link> detail page.
      </p>
    </>
  );
}
