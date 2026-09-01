import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getBucket } from "../applicationBuckets";
import {
  describeApplicationListFilters,
  hasApplicationListFilters,
  matchesApplicationListFilters,
  parseApplicationListFilters,
  statusOptionsForView,
  type ApplicationsListView,
} from "../applicationFilters";
import { matchesView, type ApplicationsView } from "../applicationViews";
import ImportFromUrl from "../components/ImportFromUrl";
import StatusBadge from "../components/StatusBadge";
import { statusLabel } from "../statusLabels";
import { getApplications, getResumes, getStaleApplied, archiveStaleApplied, type Application, type ApplicationBody } from "../api/client";

function listViewLabel(view: ApplicationsListView): string {
  if (view === "past") return "past";
  if (view === "all") return "";
  return "active";
}

export default function ApplicationsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => parseApplicationListFilters(searchParams),
    [searchParams],
  );
  const { view, bucketId, status: statusParam, resume: resumeParam } = filters;
  const bucket = getBucket(bucketId);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companySearch, setCompanySearch] = useState("");
  const [rows, setRows] = useState<Application[]>([]);
  const [resumeLabels, setResumeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [archivingStale, setArchivingStale] = useState(false);

  function loadApplications() {
    setLoading(true);
    setError(null);
    return getApplications()
      .then((data) => {
        setRows(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load applications");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function loadStaleCount() {
    return getStaleApplied()
      .then((data) => setStaleCount(data.count))
      .catch(() => setStaleCount(0));
  }

  useEffect(() => {
    let alive = true;
    void loadApplications().then(() => {
      if (!alive) return;
    });
    void loadStaleCount();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getResumes()
      .then((resumes) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const row of resumes) map[row.id] = row.label;
        setResumeLabels(map);
      })
      .catch(() => {
        /* resume labels are optional for the filter banner */
      });
    return () => {
      alive = false;
    };
  }, []);

  const viewRows = useMemo(() => {
    if (view === "all") return rows;
    return rows.filter((app) => matchesView(app.status, view));
  }, [rows, view]);

  const activeCount = useMemo(
    () => rows.filter((app) => matchesView(app.status, "active")).length,
    [rows],
  );
  const pastCount = useMemo(
    () => rows.filter((app) => matchesView(app.status, "past")).length,
    [rows],
  );

  const statusOptions = useMemo(() => statusOptionsForView(view), [view]);

  const filterDescription = useMemo(() => {
    const resumeLabel =
      resumeParam && resumeParam !== "none" ? resumeLabels[resumeParam] : undefined;
    return describeApplicationListFilters(filters, resumeLabel);
  }, [filters, resumeParam, resumeLabels]);

  const showFilterBanner = hasApplicationListFilters(filters);

  const filteredRows = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return viewRows.filter((app) => {
      if (!matchesApplicationListFilters(app, filters)) return false;
      if (statusFilter !== "all" && app.status !== statusFilter) return false;
      if (!q) return true;
      return (
        app.company.toLowerCase().includes(q) ||
        app.title.toLowerCase().includes(q)
      );
    });
  }, [viewRows, companySearch, filters, statusFilter]);

  function setView(next: ApplicationsView) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "active") params.delete("view");
      else params.set("view", "past");
      params.delete("bucket");
      params.delete("status");
      params.delete("source");
      params.delete("resume");
      params.delete("milestone");
      return params;
    });
  }

  function onUrlImported(preview: ApplicationBody, warnings: string[] = []) {
    navigate("/applications/new", { state: { draft: preview, importWarnings: warnings } });
  }

  useEffect(() => {
    setStatusFilter(statusParam ?? "all");
  }, [statusParam]);

  async function handleArchiveStale() {
    const noun = staleCount === 1 ? "application" : "applications";
    const confirmed = window.confirm(
      `Archive ${staleCount} ${noun} that have stayed in Applied for 30+ days without moving forward? They will move to Past applications.`,
    );
    if (!confirmed) return;

    setArchivingStale(true);
    setError(null);
    try {
      await archiveStaleApplied();
      await Promise.all([loadApplications(), loadStaleCount()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to archive stale applications");
    } finally {
      setArchivingStale(false);
    }
  }

  function clearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("bucket");
      next.delete("status");
      next.delete("source");
      next.delete("resume");
      next.delete("milestone");
      next.delete("view");
      return next;
    });
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
          gap: 16,
        }}
      >
        <div>
          <h1>Applications</h1>
          <p>
            {view === "active"
              ? "Roles you’re still pursuing — search, filter, or add from a job link."
              : "Rejected and closed roles — kept for reference, separate from your active pipeline."}
          </p>
        </div>
        {view === "active" ? (
          <Link to="/applications/new" className="btn btn--secondary">
            Manual entry
          </Link>
        ) : null}
      </header>

      {view === "active" ? (
        <ImportFromUrl onImported={(preview, _sources, warnings) => onUrlImported(preview, warnings)} />
      ) : null}

      <nav className="tabs" aria-label="Application lists">
        <button
          type="button"
          className={`tab${view === "active" ? " tab--active" : ""}`}
          onClick={() => setView("active")}
          aria-pressed={view === "active"}
        >
          Active pipeline ({activeCount})
        </button>
        <button
          type="button"
          className={`tab${view === "past" ? " tab--active" : ""}`}
          onClick={() => setView("past")}
          aria-pressed={view === "past"}
        >
          Past applications ({pastCount})
        </button>
      </nav>

      {showFilterBanner ? (
        <div className="filter-banner">
          <span>
            Showing: <strong>{filterDescription}</strong>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {view === "active" && staleCount > 0 ? (
        <div className="filter-banner">
          <span>
            <strong>{staleCount}</strong> active{" "}
            {staleCount === 1 ? "application has" : "applications have"} been in Applied for 30+
            days without moving forward.
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void handleArchiveStale()}
            disabled={archivingStale}
          >
            {archivingStale ? "Archiving…" : "Archive stale"}
          </button>
        </div>
      ) : null}

      <div className="list-toolbar">
        <label className="search-field">
          <span className="search-field__label">Search</span>
          <input
            type="search"
            placeholder="Company or role…"
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            aria-label="Search applications by company or role"
          />
        </label>
        <label className="status-filter-field">
          <span className="search-field__label">Status</span>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p>Loading applications…</p> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      {!loading && !error ? (
        filteredRows.length === 0 ? (
          <div className="card empty-state">
            <p>
              {companySearch.trim()
                ? `No applications match "${companySearch.trim()}".`
                : showFilterBanner
                  ? `No applications match "${filterDescription}".`
                  : view === "past"
                    ? "No past applications yet. When you mark a role as rejected, withdrawn, or archived, it will appear here."
                    : view === "all"
                      ? "No applications yet. Paste a job link above or add one manually."
                      : "No active applications yet. Paste a job link above or add one manually."}
            </p>
            {view === "active" && !companySearch.trim() && !showFilterBanner ? (
              <Link to="/applications/new" className="btn btn--primary" style={{ marginTop: 12 }}>
                Add manually
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="table-wrap">
            <p style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              {filteredRows.length}
              {listViewLabel(view) ? ` ${listViewLabel(view)}` : ""} application
              {filteredRows.length === 1 ? "" : "s"}
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Applied</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <Link to={`/applications/${app.id}`} style={{ fontWeight: 600 }}>
                        {app.company}
                      </Link>
                    </td>
                    <td>{app.title}</td>
                    <td>
                      <StatusBadge status={app.status} />
                    </td>
                    <td>{app.applied_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </>
  );
}
