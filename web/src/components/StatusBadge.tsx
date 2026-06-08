import type { ApplicationStatus } from "../api/client";
import { statusLabel } from "../statusLabels";

export default function StatusBadge({ status }: { status: ApplicationStatus | string }) {
  const slug = String(status).replace(/\s+/g, "_");
  return <span className={`status-badge status-badge--${slug}`}>{statusLabel(status)}</span>;
}
