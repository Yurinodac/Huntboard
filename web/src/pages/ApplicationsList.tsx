import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getBucket, matchesBucket } from "../applicationBuckets";
import {
  ACTIVE_STATUSES,
  matchesView,
  PAST_STATUSES,
  type ApplicationsView,
} from "../applicationViews";
import ImportFromUrl from "../components/ImportFromUrl";
import StatusBadge from "../components/StatusBadge";
import { statusLabel } from "../statusLabels";
import { getApplications, type Application, type ApplicationBody } from "../api/client";

function parseView(param: string | null): ApplicationsView {
  return param === "past" ? "past" : "active";
}

export default function ApplicationsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const bucketId = searchParams.get("bucket");
  const bucket = getBucket(bucketId);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companySearch, setCompanySearch] = useState("");
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bucket) setStatusFilter("all");
  }, [bucketId, bucket]);

  useEffect(() => {
    setStatusFilter("all");
  }, [view]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getApplications()
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load applications");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const viewRows = useMemo(() => rows.filter((app) => matchesView(app.status, view)), [rows, view]);

  const activeCount = useMemo(
    () => rows.filter((app) => matchesView(app.status, "active")).length,
    [rows],
  );
  const pastCount = useMemo(
    () => rows.filter((app) => matchesView(app.status, "past")).length,
    [rows],
  );

  const statusOptions = useMemo(() => {
    const base = view === "active" ? ACTIVE_STATUSES : PAST_STATUSES;
    return ["all", ...base];
  }, [view]);

  const filteredRows = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return viewRows.filter((app) => {
      if (bucket && !matchesBucket(app.status, bucket)) return false;
      if (statusFilter !== "all" && app.status !== statusFilter) return false;
      if (!q) return true;
      return (
        app.company.toLowerCase().includes(q) ||
        app.title.toLowerCase().includes(q)
      );
    });
  }, [viewRows, companySearch, bucket, statusFilter]);

  function setView(next: ApplicationsView) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "active") params.delete("view");
      else params.set("view", "past");
      params.delete("bucket");
      return params;
    });
  }

  function onUrlImported(preview: ApplicationBody, warnings: string[] = []) {
    navigate("/applications/new", { state: { draft: preview, importWarnings: warnings } });
  }

  function clearBucket() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("bucket");
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

      {bucket && view === "active" ? (
        <div className="filter-banner">
          <span>
            Showing: <strong>{bucket.label}</strong>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearBucket}>
            Show all active
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
                ? `No ${view === "past" ? "past" : "active"} applications match "${companySearch.trim()}".`
                : view === "past"
                  ? "No past applications yet. When you mark a role as rejected, withdrawn, or archived, it will appear here."
                  : bucket
                    ? `No applications in "${bucket.label}".`
                    : "No active applications yet. Paste a job link above or add one manually."}
            </p>
            {view === "active" && !companySearch.trim() && !bucket ? (
              <Link to="/applications/new" className="btn btn--primary" style={{ marginTop: 12 }}>
                Add manually
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="table-wrap">
            <p style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              {filteredRows.length} {view === "past" ? "past" : "active"} application
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
