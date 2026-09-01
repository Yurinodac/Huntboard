import { useMemo, useState } from "react";
import { statusLabel } from "../statusLabels";
import type { Application } from "../api/client";

function matchesApplicationSearch(app: Application, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    app.company.toLowerCase().includes(q) ||
    app.title.toLowerCase().includes(q) ||
    (app.location?.toLowerCase().includes(q) ?? false)
  );
}

function formatApplicationOption(app: Application): string {
  const status = statusLabel(app.status);
  return `${app.company} — ${app.title} (${status})`;
}

type ApplicationPickerProps = {
  applications: Application[];
  value: string;
  onChange: (applicationId: string) => void;
  disabled?: boolean;
};

export default function ApplicationPicker({
  applications,
  value,
  onChange,
  disabled = false,
}: ApplicationPickerProps) {
  const [search, setSearch] = useState("");

  const filteredApplications = useMemo(() => {
    const matches = applications.filter((app) => matchesApplicationSearch(app, search));
    if (value && !matches.some((app) => app.id === value)) {
      const selected = applications.find((app) => app.id === value);
      if (selected) return [selected, ...matches];
    }
    return matches;
  }, [applications, search, value]);

  const selected = applications.find((app) => app.id === value);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label className="search-field" style={{ minWidth: 0 }}>
        <span className="search-field__label">Search applications</span>
        <input
          type="search"
          placeholder="Company, role, or location…"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search applications to link"
        />
      </label>
      <label style={{ display: "block", fontSize: "0.9rem" }}>
        Selected application
        <select
          style={{ marginTop: 6, width: "100%" }}
          value={value}
          disabled={disabled || filteredApplications.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          {filteredApplications.length === 0 ? (
            <option value="">No applications match your search</option>
          ) : (
            filteredApplications.map((app) => (
              <option key={app.id} value={app.id}>
                {formatApplicationOption(app)}
              </option>
            ))
          )}
        </select>
      </label>
      {search.trim() && filteredApplications.length > 0 ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-muted)" }}>
          {filteredApplications.length} match{filteredApplications.length === 1 ? "" : "es"}
          {selected && !matchesApplicationSearch(selected, search)
            ? " (current selection kept visible)"
            : ""}
        </p>
      ) : null}
    </div>
  );
}
