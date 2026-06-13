import { z } from "zod";
import { ApplicationPatch } from "../types/application.js";

/** Accept valid field updates even when the combined patch would fail Zod. */
export function parseConfirmFieldUpdates(raw: unknown): z.infer<typeof ApplicationPatch> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};

  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = ApplicationPatch.safeParse({ [key]: value });
    if (parsed.success) {
      Object.assign(merged, parsed.data);
    }
  }
  return merged as z.infer<typeof ApplicationPatch>;
}
