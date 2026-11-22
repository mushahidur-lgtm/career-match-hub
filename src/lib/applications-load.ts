import { SavedJobSchema } from "@/lib/schemas";
import { stashUnreadable } from "@/lib/storage";
import type { Application } from "@/types/job";

/**
 * Reads stored applications one at a time. A single damaged entry must not take your whole
 * tracker with it: the readable ones are kept and only the damaged ones are returned for setting aside.
 */
export function readApplications(value: unknown[]): { kept: Application[]; rejected: unknown[] } {
  const kept: Application[] = [];
  const rejected: unknown[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const r = SavedJobSchema.safeParse(entry);
    if (!r.success) {
      rejected.push(entry);
      continue;
    }
    // The same job id twice would break every lookup, so the later copy is set aside.
    if (seen.has(r.data.job.id)) {
      rejected.push(entry);
      continue;
    }
    seen.add(r.data.job.id);
    kept.push(r.data as Application);
  }
  return { kept, rejected };
}

/** Keeps entries that could not be read, so they can be downloaded from Settings instead of being lost. */
export function stashRejected(entries: unknown[]): void {
  try {
    stashUnreadable(window.localStorage, `cmh:applications:entries:${Date.now()}`, JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}
