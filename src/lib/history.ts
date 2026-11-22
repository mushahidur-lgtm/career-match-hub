import { jobKey } from "@/lib/backup";
import { newId } from "@/lib/ids";
import { parseRequirements } from "@/lib/matching/requirements";
import type { IntelStore, Job, ResumeVersion, SearchFilters, SearchRecord, SearchResponse, SeenJob } from "@/types/job";

/** Browser storage is small, so old entries are dropped rather than the newest being refused. */
export const HISTORY_MAX = 500;
export const SEEN_MAX = 1500;
const REQUIRED_KEPT = 12;
const PREFERRED_KEPT = 6;

export const EMPTY_INTEL: IntelStore = { history: [], seen: [] };

/** The pay an employer stated, as yearly CAD. An estimate, or pay in another currency, is not counted. */
export function statedPay(job: Pick<Job, "salary">): { lo: number; hi: number } | null {
  const s = job.salary;
  if (!s || s.estimated || s.currency !== "CAD") return null;
  const lo = s.min ?? s.max;
  const hi = s.max ?? s.min;
  if (lo === null || hi === null) return null;
  const yearly = s.period === "hour" ? 2080 : 1;
  const a = Math.round(lo * yearly);
  const b = Math.round(hi * yearly);
  // Anything outside this is a typo in the posting, not a salary.
  if (a < 10_000 || b > 1_000_000) return null;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

/** What one search saw of a posting. Small enough to store in a daily run and replay later. */
export type Observation = Omit<SeenJob, "firstSeenAt" | "lastSeenAt" | "seenCount">;

export function observe(job: Job): Observation {
  const req = parseRequirements(job.title, job.description);
  return {
    key: jobKey(job),
    title: job.title.slice(0, 200),
    company: job.company.slice(0, 200),
    location: job.location.slice(0, 200),
    workMode: job.workMode,
    employmentType: job.employmentType,
    category: job.category,
    pay: statedPay(job),
    postedAt: job.postedAt,
    source: job.source,
    score: job.match ? job.match.score : null,
    confidence: job.match?.detail?.confidence ?? null,
    required: req.required.slice(0, REQUIRED_KEPT),
    preferred: req.preferred.slice(0, PREFERRED_KEPT),
    truncated: job.descriptionTruncated,
  };
}

/**
 * Adds one finished search to the history and notes every job it returned. Pure: returns a new store.
 * A search that returned nothing from a real source is still recorded (that is a fact about the market),
 * but a search with no job source configured is not, since nothing was observed.
 */
export function recordSearch(
  store: IntelStore,
  input: { at: string; filters: SearchFilters; response: Pick<SearchResponse, "jobs" | "provider" | "scoring">; resume: Pick<ResumeVersion, "name"> | null },
): IntelStore {
  const { at, filters, response, resume } = input;
  return recordObservations(store, { at, filters, provider: response.provider, scoring: response.scoring, resumeName: resume?.name ?? null, observations: response.jobs.map(observe) });
}

/**
 * The same as recordSearch, from observations already taken. The daily run uses this: the server
 * takes the observations, and your browser replays them. A given `id` makes a replay idempotent,
 * because a search already in the history under that id is left alone.
 */
export function recordObservations(
  store: IntelStore,
  input: { id?: string; at: string; filters: SearchFilters; provider: SearchRecord["provider"]; scoring: SearchRecord["scoring"]; resumeName: string | null; observations: Observation[] },
): IntelStore {
  const { at, filters, provider, observations } = input;
  if (provider === "none") return store;
  if (input.id && store.history.some((h) => h.id === input.id)) return store;

  const index = new Map(store.seen.map((s) => [s.key, s]));
  let fresh = 0;
  const thisSearch = new Set<string>();
  for (const o of observations) {
    // A posting listed twice in one search still counts once.
    if (thisSearch.has(o.key)) continue;
    thisSearch.add(o.key);
    const previous = index.get(o.key);
    if (!previous) fresh += 1;
    // A search replayed out of order must not move a job's first sighting later, or its latest one earlier.
    const firstSeenAt = previous && previous.firstSeenAt < at ? previous.firstSeenAt : at;
    const lastSeenAt = previous && previous.lastSeenAt > at ? previous.lastSeenAt : at;
    const latest = lastSeenAt === at ? o : previous!;
    index.set(o.key, { ...latest, key: o.key, firstSeenAt, lastSeenAt, seenCount: (previous?.seenCount ?? 0) + 1 });
  }

  const scores = observations.flatMap((o, i) => (observations.findIndex((x) => x.key === o.key) === i && o.score !== null ? [o.score] : []));
  const record: SearchRecord = {
    id: input.id ?? newId(),
    at,
    filters,
    provider,
    scoring: input.scoring,
    resumeName: input.resumeName ? input.resumeName.slice(0, 120) : null,
    resultCount: thisSearch.size,
    newCount: fresh,
    avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    scoredCount: scores.length,
  };

  const seen = [...index.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, SEEN_MAX);
  const history = [record, ...store.history].sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_MAX);
  return { history, seen };
}

export const removeSearch = (store: IntelStore, id: string): IntelStore => ({ ...store, history: store.history.filter((h) => h.id !== id) });

/** Forgets the search list but keeps what was seen, or the other way round. */
export const clearHistory = (store: IntelStore): IntelStore => ({ ...store, history: [] });
export const clearSeen = (): IntelStore => ({ history: [], seen: [] });

/** Combines two stores without duplicates: searches by id, jobs by key (the more recent sighting wins, the earliest first-seen is kept). */
export function mergeIntel(current: IntelStore, incoming: IntelStore): IntelStore {
  const history = new Map(current.history.map((h) => [h.id, h]));
  for (const h of incoming.history) if (!history.has(h.id)) history.set(h.id, h);
  const seen = new Map(current.seen.map((j) => [j.key, j]));
  for (const j of incoming.seen) {
    const have = seen.get(j.key);
    if (!have) {
      seen.set(j.key, j);
      continue;
    }
    const newer = j.lastSeenAt > have.lastSeenAt ? j : have;
    seen.set(j.key, { ...newer, firstSeenAt: j.firstSeenAt < have.firstSeenAt ? j.firstSeenAt : have.firstSeenAt, seenCount: Math.max(j.seenCount, have.seenCount) });
  }
  return {
    history: [...history.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_MAX),
    seen: [...seen.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, SEEN_MAX),
  };
}

/**
 * Used when browser storage is full: history gives way so the applications, which matter more, can still be saved.
 * Keeps the newest half. Returns null once there is little left to give up.
 */
export function shrinkIntel(store: IntelStore): IntelStore | null {
  if (store.seen.length < 20 && store.history.length < 5) return null;
  return {
    history: store.history.slice(0, Math.floor(store.history.length / 2)),
    seen: [...store.seen].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, Math.floor(store.seen.length / 2)),
  };
}
