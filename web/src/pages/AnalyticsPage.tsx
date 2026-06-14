import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  applicationsExportCsvUrl,
  getAnalyticsSummary,
  type AnalyticsSummary,
} from "../api/client";
import { analyticsDrilldown } from "../applicationFilters";
import { statusLabel } from "../statusLabels";
import { sourceLabel } from "../sourceLabels";

/** Percent of all applications (not active-only). */
function pctOfAll(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function DrilldownLink({
  to,
  children,
  title,
}: {
  to: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Link to={to} className="drilldown-link" title={title ?? "View matching applications"}>
      {children}
    </Link>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalyticsSummary()
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const statusRows = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_status).sort((a, b) => b[1] - a[1]);
  }, [summary]);

  const sourceRows = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.by_source).sort((a, b) => b[1] - a[1]);
  }, [summary]);

  const total = summary?.total ?? 0;

  return (
    <>
      <header className="page-header">
        <h1>Analytics</h1>
        <p>
          Pipeline stats from your saved applications. Percentages are of{" "}
          <strong>all applications</strong>, not just the active pipeline. Click a number to see
          those applications. Status history and key dates update automatically when you save or
          apply Gmail suggestions.
        </p>
      </header>

      {error ? <div className="alert alert--error">{error}</div> : null}

      {!summary && !error ? <p style={{ color: "var(--ink-muted)" }}>Loading…</p> : null}

      {summary ? (
        <>
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <Link to={analyticsDrilldown.total()} className="stat-card stat-card--link">
              <strong>{summary.total}</strong>
              <span>Total applications</span>
            </Link>
            <Link
              to={analyticsDrilldown.positiveProgress()}
              className="stat-card stat-card--link"
            >
              <strong>{summary.funnel.positive_progress}</strong>
              <span>
                Pre-assessment, screen, or interview ({pctOfAll(summary.funnel.positive_progress, total)})
              </span>
            </Link>
            <Link to={analyticsDrilldown.interview()} className="stat-card stat-card--link">
              <strong>{summary.funnel.interview}</strong>
              <span>Interview ({pctOfAll(summary.funnel.interview, total)})</span>
            </Link>
            <Link to={analyticsDrilldown.offer()} className="stat-card stat-card--link">
              <strong>{summary.funnel.offer}</strong>
              <span>Offers ({pctOfAll(summary.funnel.offer, total)})</span>
            </Link>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem" }}>Funnel</h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>
                <DrilldownLink to={analyticsDrilldown.total()}>
                  <strong>{summary.funnel.total}</strong>
                </DrilldownLink>{" "}
                total logged
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.positiveProgress()}>
                  <strong>{summary.funnel.positive_progress}</strong>
                </DrilldownLink>{" "}
                reached pre-assessment, recruiter screen, or interview (
                {pctOfAll(summary.funnel.positive_progress, total)} of all applications)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.interview()}>
                  <strong>{summary.funnel.interview}</strong>
                </DrilldownLink>{" "}
                at interview stage ({pctOfAll(summary.funnel.interview, total)} of all applications)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.offer()}>
                  <strong>{summary.funnel.offer}</strong>
                </DrilldownLink>{" "}
                offers ({pctOfAll(summary.funnel.offer, total)} of all applications)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.rejected()}>
                  <strong>{summary.funnel.rejected}</strong>
                </DrilldownLink>{" "}
                rejected ({pctOfAll(summary.funnel.rejected, total)} of all applications)
              </li>
            </ul>
          </div>

          {summary.by_resume.length > 0 ? (
            <div className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>By resume version</h2>
              <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
                Compare resume versions. Percentages are share of{" "}
                <strong>all {total} applications</strong> (same denominator as the funnel). Click
                a count to see those applications.
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Resume</th>
                      <th>Uses</th>
                      <th>Pre-assess / screen / interview</th>
                      <th>Interview</th>
                      <th>Offer</th>
                      <th>Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_resume.map((row) => (
                      <tr key={row.resume_version_id ?? "none"}>
                        <td>
                          <DrilldownLink to={analyticsDrilldown.byResume(row.resume_version_id)}>
                            {row.label}
                          </DrilldownLink>
                        </td>
                        <td>
                          <DrilldownLink to={analyticsDrilldown.byResume(row.resume_version_id)}>
                            {row.total}
                          </DrilldownLink>
                        </td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(
                              row.resume_version_id,
                              "positive_progress",
                            )}
                          >
                            {row.positive_progress}
                          </DrilldownLink>{" "}
                          <span style={{ color: "var(--ink-muted)" }}>
                            ({pctOfAll(row.positive_progress, total)})
                          </span>
                        </td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(row.resume_version_id, "interview")}
                          >
                            {row.interview}
                          </DrilldownLink>{" "}
                          <span style={{ color: "var(--ink-muted)" }}>
                            ({pctOfAll(row.interview, total)})
                          </span>
                        </td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(row.resume_version_id, "offer")}
                          >
                            {row.offer}
                          </DrilldownLink>{" "}
                          <span style={{ color: "var(--ink-muted)" }}>
                            ({pctOfAll(row.offer, total)})
                          </span>
                        </td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(row.resume_version_id, "rejected")}
                          >
                            {row.rejected}
                          </DrilldownLink>{" "}
                          <span style={{ color: "var(--ink-muted)" }}>
                            ({pctOfAll(row.rejected, total)})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem" }}>By status</h2>
              {statusRows.length === 0 ? (
                <p style={{ margin: 0, color: "var(--ink-muted)" }}>No data yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {statusRows.map(([status, count]) => (
                    <li
                      key={status}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span>{statusLabel(status)}</span>
                      <DrilldownLink to={analyticsDrilldown.byStatus(status)}>
                        <strong>{count}</strong>
                      </DrilldownLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem" }}>By source (auto-detected)</h2>
              {sourceRows.length === 0 ? (
                <p style={{ margin: 0, color: "var(--ink-muted)" }}>No data yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {sourceRows.map(([source, count]) => (
                    <li
                      key={source}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span>{sourceLabel(source)}</span>
                      <DrilldownLink to={analyticsDrilldown.bySource(source)}>
                        <strong>{count}</strong>
                      </DrilldownLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>Export for charts</h2>
            <p style={{ margin: "0 0 16px", color: "var(--ink-muted)", fontSize: "0.95rem" }}>
              Download all applications as CSV (includes source, key dates, salary, and status).
              Open in Excel or Google Sheets to build charts.
            </p>
            <a className="btn btn--primary" href={applicationsExportCsvUrl()} download>
              Download CSV
            </a>
            <Link to="/applications" className="btn btn--ghost" style={{ marginLeft: 10 }}>
              Back to applications
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}
