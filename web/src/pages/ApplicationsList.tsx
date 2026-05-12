import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { APPLICATION_STATUSES, getApplications, type Application } from "../api/client";

export default function ApplicationsList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getApplications(statusFilter)
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
  }, [statusFilter]);

  const statusOptions = useMemo(() => ["all", ...APPLICATION_STATUSES], []);

  return (
    <main style={{ padding: 16, maxWidth: 1040, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Applications</h1>
        <Link
          to="/applications/new"
          style={{
            border: "1px solid #0a66c2",
            background: "#0a66c2",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          Add application
        </Link>
      </header>

      <label htmlFor="status-filter" style={{ display: "inline-flex", gap: 8, marginBottom: 12 }}>
        <span>Status:</span>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      {loading ? <p>Loading applications...</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!loading && !error ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #ddd",
          }}
        >
          <thead>
            <tr style={{ background: "#f6f6f6" }}>
              <th style={thStyle}>Company</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Applied date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={4}>
                  No applications found.
                </td>
              </tr>
            ) : (
              rows.map((app) => (
                <tr key={app.id}>
                  <td style={tdStyle}>
                    <Link to={`/applications/${app.id}`}>{app.company}</Link>
                  </td>
                  <td style={tdStyle}>
                    <Link to={`/applications/${app.id}`}>{app.title}</Link>
                  </td>
                  <td style={tdStyle}>{app.status}</td>
                  <td style={tdStyle}>{app.applied_date ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #ddd",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
};
