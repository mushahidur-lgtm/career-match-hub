import "server-only";
import { jobKey } from "@/lib/backup";
import { observe } from "@/lib/history";
import { scoreJob, type MatchInput } from "@/lib/matching/engine";
import { fetchJobs, type ProviderResult } from "@/lib/providers";
import { applyFilters } from "@/lib/providers/common";
import type { Job, ResumeVersion, SearchFilters, SearchPreferences } from "@/types/job";
import type { DailyPayload, TopJob } from "./daily-payload";
import { planQueries } from "./schedule";

export interface RunInput {
  resume: ResumeVersion | null;
  preferences: SearchPreferences;
  /** At most this many job-board calls. */
  maxQueries: number;
  /** Stop starting new searches after this long, so the whole run finishes inside the function time limit. */
  budgetMs: number;
}

export type RunOutcome = { ok: true; payload: DailyPayload } | { ok: false; reason: string };

const MAX_JOBS_PER_RUN = 400;

const safeLink = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u.slice(0, 2000) : null);

/**
 * Runs the morning searches. It scores by the rules only: no Claude calls, so a daily run costs nothing beyond
 * the job-board calls. Each search is one call, run one after another, and sample (demo) jobs are never used.
 */
export async function runDaily(
  input: RunInput,
  deps: { search: (f: SearchFilters) => Promise<ProviderResult>; now: () => number } = { search: fetchJobs, now: Date.now },
): Promise<RunOutcome> {
  const queries = planQueries(input.preferences, input.maxQueries);
  if (!queries.length) return { ok: false, reason: "Add primary roles and cities in Settings first." };

  const profile = input.resume?.profile ?? null;
  const match: MatchInput | null = profile
    ? {
        profile,
        resumeText: input.resume?.text ?? null,
        preferences: { locations: input.preferences.locations, minSalary: input.preferences.minSalary, roles: [...input.preferences.primaryRoles, ...input.preferences.secondaryRoles] },
        weights: input.preferences.weights,
      }
    : null;

  const started = deps.now();
  const unique = new Map<string, Job>();
  const searches: DailyPayload["searches"] = [];
  let provider: "adzuna" | "jsearch" | null = null;
  let skipped = 0;

  for (const filters of queries) {
    if (deps.now() - started > input.budgetMs) {
      skipped += 1;
      continue;
    }
    let result: ProviderResult;
    try {
      result = await deps.search(filters);
    } catch {
      skipped += 1;
      continue;
    }
    // A failed or unconfigured search is not a fact about the market, so it is not recorded.
    if (result.provider !== "adzuna" && result.provider !== "jsearch") {
      skipped += 1;
      continue;
    }
    provider ??= result.provider;
    const keys: string[] = [];
    for (const job of applyFilters(result.jobs, filters)) {
      const scored: Job = { ...job, match: match ? scoreJob(job, match) : null };
      const key = jobKey(scored);
      keys.push(key);
      const have = unique.get(key);
      if (!have || (scored.match?.score ?? -1) > (have.match?.score ?? -1)) unique.set(key, scored);
    }
    searches.push({ filters, keys: [...new Set(keys)].slice(0, 200) });
  }

  if (!searches.length || !provider) return { ok: false, reason: "No job source answered, so nothing was recorded." };

  // A run keeps at most this many distinct postings, best first, so one morning cannot flood the history.
  const jobs = [...unique.values()].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1)).slice(0, MAX_JOBS_PER_RUN);
  const top: TopJob[] = jobs
    .filter((j) => j.match)
    .sort((a, b) => b.match!.score - a.match!.score)
    .slice(0, 10)
    .map((j) => ({
      title: j.title.slice(0, 200),
      company: j.company.slice(0, 200),
      location: j.location.slice(0, 200),
      score: j.match!.score,
      pay: observe(j).pay,
      postedAt: j.postedAt,
      applyUrl: safeLink(j.applyUrl),
    }));

  return {
    ok: true,
    payload: { provider, resumeName: input.resume?.name.slice(0, 120) ?? null, observations: jobs.map(observe), searches, top, skipped },
  };
}
