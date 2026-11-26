import "server-only";
import { applyLinkInfo } from "@/lib/job-quality";
import { allowedByRobots } from "@/lib/net/robots";
import { checkUrl, safeFetch, SafeFetchError, type FetchFailure, type Page, type Transport } from "@/lib/net/safe-fetch";
import type { Job } from "@/types/job";
import { TtlCache } from "./ttl-cache";

/**
 * Loads the employer's own page for one job, once. Only employer sites and applicant tracking systems are
 * read: never a job board or an Adzuna redirect, never anything behind a login, and not where robots.txt
 * says no. Off unless JOB_PAGE_FETCH=1.
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
  | { kind: "page"; page: Page; checkedAt: string }
  | { kind: "failed"; failure: FetchFailure; checkedAt: string };

const cache = new TtlCache<PageResult>();
export const clearPageCache = () => cache.clear();

type PageJob = Pick<Job, "applyUrl" | "company" | "source">;

const BARRED = ["redirect", "job-board", "none"];

export function fetchableLink(job: PageJob): boolean {
  const kind = applyLinkInfo(job).kind;
  return kind === "employer" || kind === "tracking-system";
}

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
    if (!(await allowedByRobots(url, options.transport))) result = { kind: "robots" };
    else {
      const page = await safeFetch(job.applyUrl, {
        transport: options.transport,
        // A redirect from an employer to a job board is not followed into the board.
        allowHop: (next) => !BARRED.includes(applyLinkInfo({ ...job, applyUrl: next.toString() }).kind),
      });
      result = { kind: "page", page, checkedAt };
    }
  } catch (err) {
    result = { kind: "failed", failure: err instanceof SafeFetchError ? err.kind : "network", checkedAt };
  }
  const settled = result.kind === "page" && (result.page.status < 400 || result.page.status === 404 || result.page.status === 410);
  cache.set(key, result, settled ? successTtlMs() : FAILURE_TTL_MS, now());
  return result;
}
