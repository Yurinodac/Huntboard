import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  applicationsExportCsvUrl,
  getAnalyticsSummary,
  type AnalyticsSummary,
  type PaceWeek,
  type ResumeAnalyticsRow,
  type SourcePerformanceRow,
} from "../api/client";
import { analyticsDrilldown } from "../applicationFilters";
import { sourceLabel } from "../sourceLabels";

function pctRate(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

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

function DashboardSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-section">
      <h2 className="dashboard-section__title">{title}</h2>
      {hint ? <p className="dashboard-section__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

function MetricTile({
  to,
  value,
  label,
  sub,
}: {
  to?: string;
  value: ReactNode;
  label: string;
  sub?: string;
}) {
  const inner = (
    <>
      <strong className="metric-tile__value">{value}</strong>
      <span className="metric-tile__label">{label}</span>
      {sub ? <span className="metric-tile__sub">{sub}</span> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="metric-tile metric-tile--link">
        {inner}
      </Link>
    );
  }
  return <div className="metric-tile">{inner}</div>;
}

function RateBar({ rate }: { rate: number | null }) {
  const width = rate == null ? 0 : Math.min(100, Math.max(0, rate));
  return (
    <div className="rate-bar" aria-hidden="true">
      <div className="rate-bar__fill" style={{ width: `${width}%` }} />
    </div>
  );
}

function PaceChart({ weeks }: { weeks: PaceWeek[] }) {
  const max = useMemo(() => Math.max(1, ...weeks.map((w) => w.count)), [weeks]);
  if (weeks.length === 0) {
    return <p style={{ margin: 0, color: "var(--ink-muted)" }}>No applications logged yet.</p>;
  }
  return (
    <div className="pace-chart" role="img" aria-label="Applications logged per week">
      {weeks.map((week) => (
        <div key={week.week_start} className="pace-chart__col">
          <div
            className="pace-chart__bar"
            style={{ height: `${Math.max(8, (week.count / max) * 100)}%` }}
            title={`${week.count} application${week.count === 1 ? "" : "s"}`}
          />
          <span className="pace-chart__count">{week.count}</span>
          <span className="pace-chart__label">{week.label}</span>
        </div>
      ))}
    </div>
  );
}

function SourceBars({
  rows,
  total,
}: {
  rows: [string, number][];
  total: number;
}) {
  const max = Math.max(1, ...rows.map(([, c]) => c));
  return (
    <ul className="source-bars">
      {rows.map(([source, count]) => (
        <li key={source} className="source-bars__row">
          <div className="source-bars__head">
            <span>{sourceLabel(source)}</span>
            <DrilldownLink to={analyticsDrilldown.bySource(source)}>
              <strong>{count}</strong>
            </DrilldownLink>
          </div>
          <div className="rate-bar">
            <div
              className="rate-bar__fill"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="source-bars__pct">{pctOfAll(count, total)} of all</span>
        </li>
      ))}
    </ul>
  );
}

function ResumeTable({ rows, total }: { rows: ResumeAnalyticsRow[]; total: number }) {
  const sorted = [...rows].sort(
    (a, b) => (b.rate_interview ?? -1) - (a.rate_interview ?? -1) || b.total - a.total,
  );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Resume</th>
            <th>Uses</th>
            <th>Interview rate</th>
            <th>Offer rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
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
                <span className="table-muted"> ({pctOfAll(row.total, total)} of all)</span>
              </td>
              <td className="rate-cell">
                <DrilldownLink
                  to={analyticsDrilldown.byResume(row.resume_version_id, "ever_interview")}
                >
                  {pctRate(row.rate_interview)}
                </DrilldownLink>
                <span className="table-muted">
                  {" "}
                  · {row.ever_interview} ever
                </span>
                <RateBar rate={row.rate_interview} />
              </td>
              <td className="rate-cell">
                <DrilldownLink
                  to={analyticsDrilldown.byResume(row.resume_version_id, "ever_offer")}
                >
                  {pctRate(row.rate_offer)}
                </DrilldownLink>
                <span className="table-muted">
                  {" "}
                  · {row.ever_offer} ever
                </span>
                <RateBar rate={row.rate_offer} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcePerformanceTable({ rows }: { rows: SourcePerformanceRow[] }) {
  const sorted = [...rows].filter((r) => r.total > 0).sort(
    (a, b) => (b.rate_interview ?? -1) - (a.rate_interview ?? -1) || b.total - a.total,
  );
  if (sorted.length === 0) {
    return <p style={{ margin: 0, color: "var(--ink-muted)" }}>No source data yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Applications</th>
            <th>Interview rate</th>
            <th>Offer rate</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.source}>
              <td>{sourceLabel(row.source)}</td>
              <td>
                <DrilldownLink to={analyticsDrilldown.bySource(row.source)}>
                  {row.total}
                </DrilldownLink>
              </td>
              <td className="rate-cell">
                <DrilldownLink to={analyticsDrilldown.bySourceEverInterview(row.source)}>
                  {pctRate(row.rate_interview)}
                </DrilldownLink>
                <span className="table-muted">
                  {" "}
                  · {row.ever_interview} ever
                </span>
                <RateBar rate={row.rate_interview} />
              </td>
              <td className="rate-cell">
                <DrilldownLink to={analyticsDrilldown.bySourceEverOffer(row.source)}>
                  {pctRate(row.rate_offer)}
                </DrilldownLink>
                <span className="table-muted">
                  {" "}
                  · {row.ever_offer} ever
                </span>
                <RateBar rate={row.rate_offer} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1>Analytics</h1>
            <p style={{ marginBottom: 8 }}>
              A quick read on pacing, pipeline health, and what&apos;s working — click numbers to
              open filtered application lists.
            </p>
          </div>
          <a className="btn btn--ghost" href={applicationsExportCsvUrl()} download>
            Export CSV
          </a>
        </div>
        <p className="dashboard-footnote">
          Percentages marked &quot;of all&quot; use your full application history (
          <DrilldownLink to={analyticsDrilldown.total()}>{total} total</DrilldownLink>
          ) as the denominator. Resume rates use each resume&apos;s own application count.
        </p>
      </header>

      {error ? <div className="alert alert--error">{error}</div> : null}
      {!summary && !error ? <p style={{ color: "var(--ink-muted)" }}>Loading…</p> : null}

      {summary ? (
        <>
          <DashboardSection
            title={`This month — ${summary.this_month.label}`}
            hint="Activity dated this calendar month (applications by apply date; outcomes by key dates)."
          >
            <div className="metric-grid">
              <MetricTile
                to={analyticsDrilldown.loggedInMonth(summary.this_month.month_key)}
                value={summary.this_month.applications_logged}
                label="Applications logged"
              />
              <MetricTile
                to={analyticsDrilldown.interviewsInMonth(summary.this_month.month_key)}
                value={summary.this_month.interviews}
                label="Interviews (first)"
              />
              <MetricTile
                to={analyticsDrilldown.offersInMonth(summary.this_month.month_key)}
                value={summary.this_month.offers}
                label="Offers"
              />
              <MetricTile
                to={analyticsDrilldown.rejectionsInMonth(summary.this_month.month_key)}
                value={summary.this_month.rejections}
                label="Rejections"
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Application pace"
            hint="Applications logged per week (by apply date, or created date if apply date is empty). Last 8 weeks."
          >
            <PaceChart weeks={summary.pace_weeks} />
          </DashboardSection>

          <DashboardSection
            title="Pipeline today"
            hint="Where applications sit right now — a snapshot, not historical highs."
          >
            <div className="metric-grid">
              <MetricTile
                to={analyticsDrilldown.active()}
                value={summary.funnel.active}
                label="Active pipeline"
                sub={pctOfAll(summary.funnel.active, total) + " of all"}
              />
              <MetricTile
                to={analyticsDrilldown.positiveProgress()}
                value={summary.funnel.positive_progress}
                label="In progress"
                sub="Pre-assess / screen / interview"
              />
              <MetricTile
                to={analyticsDrilldown.interview()}
                value={summary.funnel.interview}
                label="At interview"
              />
              <MetricTile
                to={analyticsDrilldown.offer()}
                value={summary.funnel.offer}
                label="At offer"
              />
              <MetricTile
                to={analyticsDrilldown.past()}
                value={summary.past_count}
                label="Past (closed)"
                sub={`${summary.funnel.rejected} rejected now`}
              />
            </div>
          </DashboardSection>

          <DashboardSection
            title="Search performance (all time)"
            hint="Based on status history — still counts after a rejection or status change."
          >
            <div className="metric-grid metric-grid--wide">
              <MetricTile
                to={analyticsDrilldown.everInterview()}
                value={pctRate(summary.conversion.rate_interview)}
                label="Ever reached interview"
                sub={`${summary.conversion.ever_interview} apps`}
              />
              <MetricTile
                to={analyticsDrilldown.everOffer()}
                value={pctRate(summary.conversion.rate_offer)}
                label="Ever got an offer"
                sub={`${summary.conversion.ever_offer} apps`}
              />
              <MetricTile
                value={pctRate(summary.conversion.interview_to_offer_rate)}
                label="Interview → offer"
                sub="Among apps that ever interviewed"
              />
              <MetricTile
                to={analyticsDrilldown.everPositiveProgress()}
                value={pctRate(summary.conversion.rate_positive_progress)}
                label="Ever progressed"
                sub="Pre-assess / screen / interview"
              />
            </div>
          </DashboardSection>

          {summary.by_resume.length > 0 ? (
            <DashboardSection
              title="Which resume is working?"
              hint="Interview and offer rates per resume version (historical milestones). Sorted by interview rate."
            >
              <ResumeTable rows={summary.by_resume} total={total} />
            </DashboardSection>
          ) : null}

          {summary.by_source_performance.length > 0 ? (
            <DashboardSection
              title="Interview rate by source"
              hint="Historical milestones per channel — which sources lead to interviews and offers. Sorted by interview rate."
            >
              <SourcePerformanceTable rows={summary.by_source_performance} />
            </DashboardSection>
          ) : null}

          {sourceRows.length > 0 ? (
            <DashboardSection
              title="Application volume by source"
              hint="Where you logged applications — click a count to open that list."
            >
              <SourceBars rows={sourceRows} total={total} />
            </DashboardSection>
          ) : null}
        </>
      ) : null}
    </>
  );
}
