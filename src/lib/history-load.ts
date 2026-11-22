import { SearchRecordSchema, SeenJobSchema } from "@/lib/schemas";
import { stashUnreadable } from "@/lib/storage";
import type { IntelStore } from "@/types/job";

/**
 * Reads the stored history one entry at a time, so one damaged entry never hides the rest.
 * Entries that cannot be read are returned for setting aside, not thrown away.
 */
export function readIntel(value: unknown): { store: IntelStore; rejected: unknown[] } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as { history?: unknown; seen?: unknown };
  if (!Array.isArray(v.history) || !Array.isArray(v.seen)) return undefined;
  const rejected: unknown[] = [];
  const history = [];
  for (const e of v.history) {
    const r = SearchRecordSchema.safeParse(e);
    if (r.success) history.push(r.data);
    else rejected.push(e);
  }
  const seen = [];
  const keys = new Set<string>();
  for (const e of v.seen) {
    const r = SeenJobSchema.safeParse(e);
    if (!r.success || keys.has(r.data.key)) {
      rejected.push(e);
      continue;
    }
    keys.add(r.data.key);
    seen.push(r.data);
  }
  return { store: { history, seen }, rejected };
}

export function stashIntel(entries: unknown[]): void {
  try {
    stashUnreadable(window.localStorage, `cmh:intel:entries:${Date.now()}`, JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}
