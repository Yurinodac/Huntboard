import { APPLICATION_STATUSES, type ApplicationStatus } from "../api/client";
import { statusLabel } from "../statusLabels";

type StatusPickerProps = {
  value: ApplicationStatus;
  onChange: (status: ApplicationStatus) => void;
  disabled?: boolean;
};

export default function StatusPicker({ value, onChange, disabled = false }: StatusPickerProps) {
  return (
    <label className="search-field" style={{ minWidth: 0 }}>
      <span className="search-field__label">Status</span>
      <select
        value={value}
        disabled={disabled}
        aria-label="Application status"
        onChange={(event) => onChange(event.target.value as ApplicationStatus)}
      >
        {APPLICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status)}
          </option>
        ))}
      </select>
    </label>
  );
}
