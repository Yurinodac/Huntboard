import type { FieldUpdateSuggestion } from "../api/client";

type Props = {
  updates: FieldUpdateSuggestion[];
  selected: Set<string>;
  onToggle: (field: string, checked: boolean) => void;
};

export default function GmailFieldUpdates({ updates, selected, onToggle }: Props) {
  if (updates.length === 0) return null;

  return (
    <div className="field-updates" role="group" aria-label="Suggested application updates">
      <p className="field-updates__title">Suggested field updates</p>
      <ul className="field-updates__list">
        {updates.map((row) => (
          <li key={row.field} className="field-updates__row">
            <label className="field-updates__label">
              <input
                type="checkbox"
                checked={selected.has(row.field)}
                onChange={(e) => onToggle(row.field, e.target.checked)}
              />
              <span className="field-updates__name">{row.label}</span>
            </label>
            <div className="field-updates__diff">
              <span className="field-updates__current">
                {row.field === "salary_min" || row.field === "salary_max"
                  ? row.current
                    ? `$${Number(row.current).toLocaleString("en-US")}`
                    : <em>empty</em>
                  : row.current ?? <em>empty</em>}
              </span>
              <span className="field-updates__arrow" aria-hidden="true">
                →
              </span>
              <span className="field-updates__proposed">
                {row.field === "salary_min" || row.field === "salary_max"
                  ? `$${Number(row.proposed).toLocaleString("en-US")}`
                  : row.proposed}
              </span>
            </div>
            <span className="field-updates__reason">{row.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
