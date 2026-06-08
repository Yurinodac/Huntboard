import { useMemo, useState } from "react";
import {
  ApiRequestError,
  importApplicationFromPaste,
  importApplicationFromUrl,
  type ApplicationBody,
} from "../api/client";

type Props = {
  onImported: (preview: ApplicationBody, sources: string[], warnings: string[]) => void;
  submitLabel?: string;
};

function isLinkedInJobUrl(url: string): boolean {
  try {
    return /linkedin\.com/i.test(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
}

export default function ImportFromUrl({ onImported, submitLabel = "Import details" }: Props) {
  const [url, setUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const linkedInHint = useMemo(() => isLinkedInJobUrl(url), [url]);

  function applyImportResult(
    result: Awaited<ReturnType<typeof importApplicationFromUrl>>,
  ) {
    const w = result.warnings ?? [];
    if (result.ai_used) {
      w.unshift("AI refined this posting for a fuller job summary.");
    }
    setWarnings(w);
    onImported(result.preview, result.sources, w);
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await importApplicationFromUrl(trimmed);
      applyImportResult(result);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "LINKEDIN_BLOCKED") {
        setShowPaste(true);
      }
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasteImport() {
    const text = pasteText.trim();
    if (text.length < 40) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await importApplicationFromPaste(text, url.trim() || undefined);
      applyImportResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="import-panel" aria-labelledby="import-heading">
      <h2 id="import-heading">Add from job link</h2>
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.95rem" }}>
        Works best on <strong>company careers pages</strong>. LinkedIn blocks automated
        downloads — paste the job text below when using a LinkedIn URL.
      </p>
      {linkedInHint ? (
        <div className="alert alert--warn" style={{ marginTop: 12 }} role="status">
          LinkedIn usually cannot be fetched from the server. Save the job URL above, then paste
          the description in the section below.
        </div>
      ) : null}
      {error ? (
        <div className="alert alert--error" style={{ marginTop: 12 }} role="alert">
          {error}
        </div>
      ) : null}
      {warnings.map((w) => (
        <div key={w} className="alert alert--warn" style={{ marginTop: 12 }}>
          {w}
        </div>
      ))}
      <div className="import-row">
        <input
          type="url"
          placeholder="https://careers.company.com/job/… or LinkedIn job URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleImport())}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={loading || !url.trim()}
          onClick={handleImport}
        >
          {loading ? "Importing…" : submitLabel}
        </button>
      </div>

      <details
        open={showPaste || linkedInHint}
        style={{ marginTop: 16 }}
        onToggle={(e) => setShowPaste((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Import pasted text (for LinkedIn and other blocked sites)
        </summary>
        <p style={{ margin: "10px 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Open the job in your browser, select the title, company, and description, copy, and
          paste here. The LinkedIn URL field above is still saved as the posting link.
        </p>
        <textarea
          rows={8}
          placeholder="Paste job title, company, and full description…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }}
        />
        <button
          type="button"
          className="btn btn--secondary"
          disabled={loading || pasteText.trim().length < 40}
          onClick={handlePasteImport}
        >
          {loading ? "Importing…" : "Import pasted text"}
        </button>
      </details>
    </section>
  );
}
