import "server-only";
import type { Job, JobSource, ProviderStatus, SearchFilters } from "@/types/job";
import { adzunaConfigured, searchAdzuna } from "./adzuna";
import { ProviderError, dedupeJobs } from "./common";
import { demoJobs } from "./demo";
import { jsearchConfigured, searchJSearch } from "./jsearch";

/**
 * Sample listings are invented, so they exist only for local development, or when
 * CMH_DEMO=1 is set on purpose. A production deployment never shows them.
 */
export function demoEnabled(): boolean {
  return process.env.CMH_DEMO === "1" || process.env.NODE_ENV === "development";
}

/** The provider that will be tried first with the keys currently configured. */
export function configuredProvider(): ProviderStatus {
  if (adzunaConfigured()) return "adzuna";
  if (jsearchConfigured()) return "jsearch";
  return demoEnabled() ? "demo" : "none";
}

export interface ProviderResult {
  jobs: Job[];
  provider: ProviderStatus;
  warnings: string[];
}

/** Tries Adzuna, then JSearch. Falls back to sample listings only when demo is enabled. */
export async function fetchJobs(filters: SearchFilters): Promise<ProviderResult> {
  const warnings: string[] = [];
  const attempts: [JobSource, () => Promise<Job[]>][] = [];
  if (adzunaConfigured()) attempts.push(["adzuna", () => searchAdzuna(filters)]);
  if (jsearchConfigured()) attempts.push(["jsearch", () => searchJSearch(filters)]);

  for (const [provider, run] of attempts) {
    try {
      return { jobs: dedupeJobs(await run()), provider, warnings };
    } catch (err) {
      const name = provider === "adzuna" ? "Adzuna" : "JSearch";
      console.error(`${name} search failed:`, err instanceof Error ? err.message : err);
      warnings.push(err instanceof ProviderError ? err.message : `${name} search failed.`);
    }
  }

  if (demoEnabled()) {
    if (attempts.length) warnings.push("Showing sample listings because the live search failed.");
    return { jobs: demoJobs(filters), provider: "demo", warnings };
  }
  if (attempts.length) {
    warnings.push("No jobs were returned because the live search failed. Try again in a minute.");
    return { jobs: [], provider: attempts[attempts.length - 1][0], warnings };
  }
  return { jobs: [], provider: "none", warnings };
}
