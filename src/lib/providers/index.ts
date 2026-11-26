import "server-only";
import { assessPosting } from "@/lib/jobs/status";
import type { Job, ProviderStatus, SearchFilters } from "@/types/job";
import { adzunaConfigured, searchAdzuna } from "./adzuna";
import { ProviderError, dedupeJobs } from "./common";
import { demoJobs } from "./demo";
import { providerHealth, recordProvider, type ProviderHealth } from "./health";
import { jsearchConfigured, searchJSearch } from "./jsearch";

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

export interface ProviderReport {
  id: "adzuna" | "jsearch";
  status: "ok" | "failed";
  /** Listings it returned, before duplicates were merged. */
  count: number;
  message?: string;
}

export const currentHealth = (): ProviderHealth[] => providerHealth({ adzuna: adzunaConfigured(), jsearch: jsearchConfigured() });

export interface ProviderResult {
  /** What each source that was asked did. */
  sources?: ProviderReport[];
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

async function attempt(p: JobSearchProvider, filters: SearchFilters, warnings: string[], sources: ProviderReport[]): Promise<Job[] | null> {
  try {
    const jobs = await p.search(filters);
    recordProvider(p.id);
    sources.push({ id: p.id, status: "ok", count: jobs.length });
    return jobs;
  } catch (err) {
    console.error(`${p.name} search failed:`, err instanceof Error ? err.message : err);
    const message = err instanceof ProviderError ? err.message : `${p.name} search failed.`;
    recordProvider(p.id, err instanceof ProviderError ? err.failure : "bad_response");
    sources.push({ id: p.id, status: "failed", count: 0, message });
    warnings.push(message);
    return null;
  }
}

/** Searches the configured sources. Falls back to sample listings only when demo is enabled. */
export async function fetchJobs(filters: SearchFilters): Promise<ProviderResult> {
  const warnings: string[] = [];
  const active = PROVIDERS.filter((p) => p.configured());
  const sources: ProviderReport[] = [];

  if (providerMode() === "all" && active.length > 1) {
    const found = await Promise.all(active.map(async (p) => ({ p, jobs: await attempt(p, filters, warnings, sources) })));
    const answered = found.filter((f) => f.jobs !== null);
    if (answered.length) {
      // One source failing still returns what the others found, with the failure named.
      return { jobs: annotate(dedupeJobs(answered.flatMap((f) => f.jobs!))), provider: answered[0].p.id, warnings, sources };
    }
  } else {
    for (const p of active) {
      const jobs = await attempt(p, filters, warnings, sources);
      if (jobs) return { jobs: annotate(dedupeJobs(jobs)), provider: p.id, warnings, sources };
    }
  }

  if (demoEnabled()) {
    if (active.length) warnings.push("Showing sample listings because the live search failed.");
    return { jobs: annotate(demoJobs(filters)), provider: "demo", warnings, ...(sources.length ? { sources } : {}) };
  }
  if (active.length) {
    warnings.push("No jobs were returned because the live search failed. Try again in a minute.");
    return { jobs: [], provider: active[active.length - 1].id, warnings, sources };
  }
  return { jobs: [], provider: "none", warnings };
}
