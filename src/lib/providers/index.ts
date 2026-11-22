import "server-only";
import type { Job, JobSource, SearchFilters } from "@/types/job";
import { adzunaConfigured, searchAdzuna } from "./adzuna";
import { ProviderError, dedupeJobs } from "./common";
import { demoJobs } from "./demo";
import { jsearchConfigured, searchJSearch } from "./jsearch";

/** The provider that will be tried first with the keys currently configured. */
export function configuredProvider(): JobSource {
  if (adzunaConfigured()) return "adzuna";
  if (jsearchConfigured()) return "jsearch";
  return "demo";
}

export interface ProviderResult {
  jobs: Job[];
  provider: JobSource;
  warnings: string[];
}

/** Tries Adzuna, then JSearch, then falls back to sample listings and says why. */
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

  if (attempts.length) warnings.push("Showing sample listings because the live search failed.");
  return { jobs: demoJobs(filters), provider: "demo", warnings };
}
