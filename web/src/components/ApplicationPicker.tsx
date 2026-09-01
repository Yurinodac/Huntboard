import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isGmailLinkableStatus } from "../applicationViews";
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
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = applications.find((app) => app.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const linkableApplications = useMemo(
    () => applications.filter((app) => isGmailLinkableStatus(app.status)),
    [applications],
  );

  const filteredApplications = useMemo(() => {
    const matches = linkableApplications.filter((app) => matchesApplicationSearch(app, query));
    if (value && selected && !matches.some((app) => app.id === value)) {
      return [selected, ...matches];
    }
    return matches;
  }, [linkableApplications, query, selected, value]);

  const inputValue = open ? query : selected ? formatApplicationOption(selected) : "";

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
  }

  function selectApplication(app: Application) {
    onChange(app.id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  return (
    <div ref={rootRef} className="app-picker">
      <div className={`app-picker__combo${open ? " app-picker__combo--open" : ""}`}>
        <input
          ref={inputRef}
          type="search"
          className="app-picker__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Search active or archived applications…"
          value={inputValue}
          disabled={disabled}
          onFocus={openPicker}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
            if (event.key === "Enter" && open && filteredApplications[0]) {
              event.preventDefault();
              selectApplication(filteredApplications[0]);
            }
          }}
        />

        {open ? (
          <ul id={listId} className="app-picker__list" role="listbox">
            {filteredApplications.length === 0 ? (
              <li className="app-picker__empty" role="option" aria-disabled="true">
                {linkableApplications.length === 0
                  ? "No active or archived applications yet."
                  : "No applications match your search."}
              </li>
            ) : (
              filteredApplications.map((app) => (
                <li key={app.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={app.id === value}
                    className={`app-picker__option${app.id === value ? " app-picker__option--selected" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectApplication(app)}
                  >
                    <span className="app-picker__option-label">{formatApplicationOption(app)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
