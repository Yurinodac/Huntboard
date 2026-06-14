import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { APP_BUCKETS, matchesBucket } from "../applicationBuckets";
import { isActiveStatus } from "../applicationViews";
import StatusBadge from "../components/StatusBadge";
import { getApplications, type Application } from "../api/client";

/** Home dashboard buckets — only counts users care to drill into */
const HOME_BUCKETS = APP_BUCKETS.filter((b) =>
  ["active", "in_conversation", "applied", "pre_assessment", "offer"].includes(b.id),
);

export default function HomePage() {
  const [apps, setApps] = useState<Application[]>([]);

  useEffect(() => {
    getApplications()
      .then(setApps)
      .catch(() => {
        /* dashboard is best-effort */
      });
  }, []);

  const bucketCounts = useMemo(() => {
    return HOME_BUCKETS.map((bucket) => ({
      bucket,
      count: apps.filter((a) => matchesBucket(a.status, bucket)).length,
    })).filter((row) => row.count > 0);
  }, [apps]);

  return (
    <>
      <header className="page-header">
        <h1>Welcome back</h1>
        <p>Jump to a slice of your pipeline or add a new role.</p>
      </header>

      {bucketCounts.length > 0 ? (
        <div className="stat-grid">
          {bucketCounts.map(({ bucket, count }) => (
            <Link
              key={bucket.id}
              to={`/applications?bucket=${bucket.id}`}
              className="stat-card stat-card--link"
            >
              <strong>{count}</strong>
              <span>{bucket.label}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty-state" style={{ marginBottom: 24 }}>
          <p>No applications yet. Add your first role to get started.</p>
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Quick actions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link to="/applications/new" className="btn btn--primary">
            Add from job link
          </Link>
          <Link to="/applications" className="btn btn--secondary">
            Active pipeline
          </Link>
          <Link to="/applications?view=past" className="btn btn--ghost">
            Past applications
          </Link>
          <Link to="/analytics" className="btn btn--ghost">
            Analytics &amp; export
          </Link>
          <Link to="/gmail" className="btn btn--ghost">
            Gmail inbox
          </Link>
        </div>
      </div>

      {apps.length > 0 ? (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: "1.15rem" }}>Recently updated</h2>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...apps]
                  .filter((a) => isActiveStatus(a.status))
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .slice(0, 5)
                  .map((app) => (
                    <tr key={app.id}>
                      <td>
                        <Link to={`/applications/${app.id}`}>{app.company}</Link>
                      </td>
                      <td>{app.title}</td>
                      <td>
                        <StatusBadge status={app.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
