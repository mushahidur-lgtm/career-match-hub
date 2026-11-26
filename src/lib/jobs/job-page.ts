import "server-only";
import { allowedByRobots } from "@/lib/net/robots";
import { checkUrl, safeFetch, SafeFetchError, type FetchFailure, type Transport } from "@/lib/net/safe-fetch";
import type { Job } from "@/types/job";
import { isJobSystemUrl } from "./job-systems";
import { digestPage, type PageDigest } from "./page-digest";
import { TtlCache } from "./ttl-cache";

/**
 * Loads the application page for one job, once. Only known job application systems are read (see
 * job-systems.ts): never an arbitrary site, a job board or an Adzuna redirect, never anything behind a login,
 * and not where robots.txt says no. Off unless JOB_PAGE_FETCH=1.
 */
export const pageFetchEnabled = () => process.env.JOB_PAGE_FETCH?.trim() === "1";

const hours = () => {
  const n = Number(process.env.JOB_CACHE_HOURS);
  return Number.isFinite(n) && n > 0 && n <= 24 * 14 ? n : 24;
};
/** A failure is remembered briefly, so a page that is down is neither hammered nor written off. */
export const FAILURE_TTL_MS = 10 * 60 * 1000;
export const successTtlMs = () => hours() * 60 * 60 * 1000;

export type PageResult =
  | { kind: "disabled" | "no_link" | "not_fetchable" | "robots" }
  | { kind: "page"; page: PageDigest; checkedAt: string }
  | { kind: "failed"; failure: FetchFailure; checkedAt: string };

const cache = new TtlCache<PageResult>(100);
export const clearPageCache = () => cache.clear();

type PageJob = Pick<Job, "applyUrl">;

export const fetchableLink = (job: PageJob): boolean => Boolean(job.applyUrl) && isJobSystemUrl(job.applyUrl!);

export interface LoadOptions {
  transport?: Transport;
  now?: () => number;
}

export async function loadJobPage(job: PageJob, options: LoadOptions = {}): Promise<PageResult> {
  const now = options.now ?? Date.now;
  if (!job.applyUrl) return { kind: "no_link" };
  if (!pageFetchEnabled()) return { kind: "disabled" };
  if (!fetchableLink(job)) return { kind: "not_fetchable" };

  const key = job.applyUrl;
  const hit = cache.get(key, now());
  if (hit) return hit;

  const checkedAt = new Date(now()).toISOString();
  let result: PageResult;
  try {
    const url = checkUrl(job.applyUrl);
    if (!(await allowedByRobots(url, options.transport, isJobSystemUrl))) result = { kind: "robots" };
    else {
      const page = await safeFetch(job.applyUrl, {
        transport: options.transport,
        // A redirect that leaves the job systems is reported, not followed.
        allowHop: isJobSystemUrl,
      });
      result = { kind: "page", page: digestPage(page), checkedAt };
    }
  } catch (err) {
    result = { kind: "failed", failure: err instanceof SafeFetchError ? err.kind : "network", checkedAt };
  }
  const settled = result.kind === "page" && (result.page.status < 400 || result.page.status === 404 || result.page.status === 410);
  cache.set(key, result, settled ? successTtlMs() : FAILURE_TTL_MS, now());
  return result;
}
