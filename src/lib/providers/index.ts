import "server-only";
import { assessPosting } from "@/lib/jobs/status";
import type { Job, ProviderStatus, SearchFilters } from "@/types/job";
import { adzunaConfigured, searchAdzuna } from "./adzuna";
import { ProviderError, dedupeJobs } from "./common";
import { demoJobs } from "./demo";
import { jsearchConfigured, searchJSearch } from "./jsearch";
import { logFailure } from "@/lib/log";

/** One job source. Add a source by adding an entry to PROVIDERS. Only official APIs belong here. */
export interface JobSearchProvider {
  id: "adzuna" | "jsearch";
  name: string;
  configured(): boolean;
  search(query: SearchFilters): Promise<Job[]>;
}

export const PROVIDERS: JobSearchProvider[] = [
  { id: "adzuna", name: "Adzuna", configured: adzunaConfigured, search: searchAdzuna },
  { id: "jsearch", name: "JSearch", configured: jsearchConfigured, search: searchJSearch },
];

/**
 * "fallback" (default) uses the first source that answers, which spends one source's quota per search.
 * "all" asks every configured source at once and merges what they return.
 */
export const providerMode = (): "fallback" | "all" => (process.env.JOB_PROVIDER_MODE?.trim().toLowerCase() === "all" ? "all" : "fallback");

/**
 * Sample listings are invented, so they exist only for local development, or when
 * CMH_DEMO=1 is set on purpose. A production deployment never shows them.
 */
export function demoEnabled(): boolean {
  return process.env.CMH_DEMO === "1" || process.env.NODE_ENV === "development";
}

/** The provider that will be tried first with the keys currently configured. */
export function configuredProvider(): ProviderStatus {
  return PROVIDERS.find((p) => p.configured())?.id ?? (demoEnabled() ? "demo" : "none");
}

export interface ProviderResult {
  jobs: Job[];
  /** The source of the results. In "all" mode, the first source that answered. */
  provider: ProviderStatus;
  warnings: string[];
}

/** Records when each listing was retrieved and what state it is in. */
export function annotate(jobs: Job[], now = new Date()): Job[] {
  return jobs.map((job) => {
    // A provider that already knows the posting is closed keeps that verdict.
    const seen = job.postingStatus === "expired" ? { status: "expired" as const, notes: job.postingNotes ?? [] } : assessPosting(job, now);
    return { ...job, retrievedAt: job.retrievedAt ?? now.toISOString(), postingStatus: seen.status, ...(seen.notes.length ? { postingNotes: seen.notes.slice(0, 5) } : {}) };
  });
}

async function attempt(p: JobSearchProvider, filters: SearchFilters, warnings: string[]): Promise<Job[] | null> {
  try {
    return await p.search(filters);
  } catch (err) {
    logFailure(`${p.name} search`, err);
    warnings.push(err instanceof ProviderError ? err.message : `${p.name} search failed.`);
    return null;
  }
}

/** Searches the configured sources. Falls back to sample listings only when demo is enabled. */
export async function fetchJobs(filters: SearchFilters): Promise<ProviderResult> {
  const warnings: string[] = [];
  const active = PROVIDERS.filter((p) => p.configured());

  if (providerMode() === "all" && active.length > 1) {
    const found = await Promise.all(active.map(async (p) => ({ p, jobs: await attempt(p, filters, warnings) })));
    const answered = found.filter((f) => f.jobs !== null);
    if (answered.length) {
      // One source failing still returns what the others found, with the failure named.
      return { jobs: annotate(dedupeJobs(answered.flatMap((f) => f.jobs!))), provider: answered[0].p.id, warnings };
    }
  } else {
    for (const p of active) {
      const jobs = await attempt(p, filters, warnings);
      if (jobs) return { jobs: annotate(dedupeJobs(jobs)), provider: p.id, warnings };
    }
  }

  if (demoEnabled()) {
    if (active.length) warnings.push("Showing sample listings because the live search failed.");
    return { jobs: annotate(demoJobs(filters)), provider: "demo", warnings };
  }
  if (active.length) {
    warnings.push("No jobs were returned because the live search failed. Try again in a minute.");
    return { jobs: [], provider: active[active.length - 1].id, warnings };
  }
  return { jobs: [], provider: "none", warnings };
}
