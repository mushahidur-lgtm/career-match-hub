import { z } from "zod";
import { recordObservations, type Observation } from "@/lib/history";
import { FiltersSchema, SeenJobSchema } from "@/lib/schemas";
import type { IntelStore } from "@/types/job";

/** What the morning run stores for you to pick up. Shared by the server that writes it and the browser that reads it. */

const ObservationSchema = SeenJobSchema.omit({ firstSeenAt: true, lastSeenAt: true, seenCount: true });

export const TopJobSchema = z.object({
  title: z.string().max(200),
  company: z.string().max(200),
  location: z.string().max(200),
  score: z.number().min(0).max(100).nullable(),
  pay: z.object({ lo: z.number(), hi: z.number() }).nullable(),
  postedAt: z.string().max(40).nullable(),
  applyUrl: z.string().max(2000).nullable(),
});
export type TopJob = z.infer<typeof TopJobSchema>;

export const DailyPayloadSchema = z.object({
  provider: z.enum(["adzuna", "jsearch"]),
  resumeName: z.string().max(120).nullable(),
  /** Every distinct posting the run saw, once. The searches refer to these by key. */
  observations: z.array(ObservationSchema).max(1000),
  searches: z.array(z.object({ filters: FiltersSchema, keys: z.array(z.string().max(500)).max(200) })).max(40),
  /** The best matches, for the Overview. Only shown when a resume was used to score. */
  top: z.array(TopJobSchema).max(10),
  /** Searches that were planned but not run, for example because the time budget ran out. */
  skipped: z.number().int().min(0).max(1000),
});
export type DailyPayload = z.infer<typeof DailyPayloadSchema>;

export const readDailyPayload = (value: unknown): DailyPayload | null => {
  const r = DailyPayloadSchema.safeParse(value);
  return r.success ? r.data : null;
};

/**
 * Adds one morning run to the history, as the searches it made at the time it ran. The search ids come from the
 * run's own id, so adding the same run twice, here or on another device that syncs, changes nothing.
 */
export function replayRun(store: IntelStore, run: { id: string; ran_at: string }, payload: DailyPayload): IntelStore {
  const byKey = new Map<string, Observation>(payload.observations.map((o) => [o.key, o]));
  let next = store;
  payload.searches.forEach((s, i) => {
    next = recordObservations(next, {
      id: `${run.id}:${i}`,
      at: run.ran_at,
      filters: s.filters,
      provider: payload.provider,
      scoring: payload.top.some((t) => t.score !== null) ? "heuristic" : "none",
      resumeName: payload.resumeName,
      observations: s.keys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])),
    });
  });
  return next;
}
