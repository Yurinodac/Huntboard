import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  applicationsExportCsvUrl,
  getAnalyticsSummary,
  type AnalyticsSummary,
} from "../api/client";
import { analyticsDrilldown } from "../applicationFilters";
import { sourceLabel } from "../sourceLabels";

function pctOfAll(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function pctRate(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
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
          Pipeline stats from your saved applications. The funnel shows where applications are{" "}
          <strong>right now</strong>; resume and conversion sections use{" "}
          <strong>status history</strong> so past progress still counts after a rejection or status
          change.
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
            <Link to={analyticsDrilldown.active()} className="stat-card stat-card--link">
              <strong>{summary.funnel.active}</strong>
              <span>Active pipeline ({pctOfAll(summary.funnel.active, total)})</span>
            </Link>
            <Link to={analyticsDrilldown.everInterview()} className="stat-card stat-card--link">
              <strong>{summary.conversion.ever_interview}</strong>
              <span>
                Ever reached interview ({pctRate(summary.conversion.rate_interview)} of all)
              </span>
            </Link>
            <Link to={analyticsDrilldown.everOffer()} className="stat-card stat-card--link">
              <strong>{summary.conversion.ever_offer}</strong>
              <span>Ever got offer ({pctRate(summary.conversion.rate_offer)} of all)</span>
            </Link>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.15rem" }}>Funnel (current status)</h2>
            <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              Snapshot of where applications sit today — not historical highs.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>
                <DrilldownLink to={analyticsDrilldown.total()}>
                  <strong>{summary.funnel.total}</strong>
                </DrilldownLink>{" "}
                total logged
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.active()}>
                  <strong>{summary.funnel.active}</strong>
                </DrilldownLink>{" "}
                active in pipeline ({pctOfAll(summary.funnel.active, total)} of all)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.positiveProgress()}>
                  <strong>{summary.funnel.positive_progress}</strong>
                </DrilldownLink>{" "}
                currently at pre-assessment, screen, or interview (
                {pctOfAll(summary.funnel.positive_progress, total)} of all)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.interview()}>
                  <strong>{summary.funnel.interview}</strong>
                </DrilldownLink>{" "}
                currently at interview ({pctOfAll(summary.funnel.interview, total)} of all)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.offer()}>
                  <strong>{summary.funnel.offer}</strong>
                </DrilldownLink>{" "}
                currently at offer ({pctOfAll(summary.funnel.offer, total)} of all)
              </li>
              <li>
                <DrilldownLink to={analyticsDrilldown.rejected()}>
                  <strong>{summary.funnel.rejected}</strong>
                </DrilldownLink>{" "}
                currently rejected ({pctOfAll(summary.funnel.rejected, total)} of all)
              </li>
            </ul>
          </div>

          {summary.by_resume.length > 0 ? (
            <div className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>By resume version</h2>
              <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
                Historical performance per resume — counts include applications that{" "}
                <strong>ever reached</strong> each stage, even if they later moved to rejected or
                another status. Interview % and offer % are of that resume&apos;s uses.
              </p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Resume</th>
                      <th>Uses</th>
                      <th>Ever pre-assess / screen / interview</th>
                      <th>Ever interview</th>
                      <th>Interview rate</th>
                      <th>Ever offer</th>
                      <th>Offer rate</th>
                      <th>Ever rejected</th>
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
                              "ever_positive_progress",
                            )}
                          >
                            {row.ever_positive_progress}
                          </DrilldownLink>
                        </td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(
                              row.resume_version_id,
                              "ever_interview",
                            )}
                          >
                            {row.ever_interview}
                          </DrilldownLink>
                        </td>
                        <td>{pctRate(row.rate_interview)}</td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(row.resume_version_id, "ever_offer")}
                          >
                            {row.ever_offer}
                          </DrilldownLink>
                        </td>
                        <td>{pctRate(row.rate_offer)}</td>
                        <td>
                          <DrilldownLink
                            to={analyticsDrilldown.byResume(
                              row.resume_version_id,
                              "ever_rejected",
                            )}
                          >
                            {row.ever_rejected}
                          </DrilldownLink>
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
              <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>Conversion rates (historical)</h2>
              <p style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "var(--ink-muted)" }}>
                All-time progression from status history — useful for comparing overall search
                effectiveness.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", lineHeight: 1.8 }}>
                <li>
                  <DrilldownLink to={analyticsDrilldown.everPositiveProgress()}>
                    <strong>{pctRate(summary.conversion.rate_positive_progress)}</strong>
                  </DrilldownLink>{" "}
                  ever reached pre-assess, screen, or interview (
                  {summary.conversion.ever_positive_progress} apps)
                </li>
                <li>
                  <DrilldownLink to={analyticsDrilldown.everInterview()}>
                    <strong>{pctRate(summary.conversion.rate_interview)}</strong>
                  </DrilldownLink>{" "}
                  ever reached interview ({summary.conversion.ever_interview} apps)
                </li>
                <li>
                  <DrilldownLink to={analyticsDrilldown.everOffer()}>
                    <strong>{pctRate(summary.conversion.rate_offer)}</strong>
                  </DrilldownLink>{" "}
                  ever got an offer ({summary.conversion.ever_offer} apps)
                </li>
                <li>
                  Interview → offer:{" "}
                  <strong>{pctRate(summary.conversion.interview_to_offer_rate)}</strong> among apps
                  that ever reached interview
                </li>
                <li>
                  <DrilldownLink to={analyticsDrilldown.everRejected()}>
                    <strong>{summary.conversion.ever_rejected}</strong>
                  </DrilldownLink>{" "}
                  ever rejected ({pctOfAll(summary.conversion.ever_rejected, total)} of all)
                </li>
              </ul>
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
