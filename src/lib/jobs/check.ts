import "server-only";
import { assessPosting } from "@/lib/jobs/status";
import { jsearchConfigured, jsearchDetails } from "@/lib/providers/jsearch";
import type { Job, PostingStatus, Verification } from "@/types/job";
import { chooseDescription, pageCandidates, type Candidate, type Enriched } from "./enrich";
import { loadJobPage, successTtlMs, FAILURE_TTL_MS, type LoadOptions } from "./job-page";
import { TtlCache } from "./ttl-cache";
import { isClosedState, verifyPosting } from "./verify";

/** Opens one job: fetches a fuller description where permitted, and checks whether it is still posted. */

export type CheckableJob = Pick<Job, "id" | "title" | "company" | "source" | "applyUrl" | "description" | "descriptionTruncated" | "postedAt">;

export interface JobCheck extends Enriched {
  verification: Verification;
  postingStatus: PostingStatus;
  postingNotes: string[];
}

const details = new TtlCache<{ text: string | null; error?: string }>();
export const clearDetailCache = () => details.clear();

/** The job source's own detail endpoint. Only JSearch has one. */
async function providerDetail(job: CheckableJob, now: number): Promise<{ text: string | null; error?: string } | null> {
  if (job.source !== "jsearch" || !job.id.startsWith("jsearch-") || !jsearchConfigured()) return null;
  const hit = details.get(job.id, now);
  if (hit) return hit;
  let result: { text: string | null; error?: string };
  try {
    result = { text: await jsearchDetails(job.id.slice("jsearch-".length)) };
  } catch {
    result = { text: null, error: "The job source could not return the full posting." };
  }
  details.set(job.id, result, result.error ? FAILURE_TTL_MS : successTtlMs(), now);
  return result;
}

export async function checkJob(job: CheckableJob, options: LoadOptions = {}): Promise<JobCheck> {
  const now = options.now ?? Date.now;
  const [detail, page] = await Promise.all([providerDetail(job, now()), loadJobPage(job, options)]);

  const candidates: Candidate[] = [...(detail?.text ? [{ source: "provider_detail" as const, text: detail.text }] : []), ...pageCandidates(job, page)];
  const pageError = page.kind === "failed" || (page.kind === "page" && page.page.status >= 400) ? "The employer's page could not be read." : undefined;
  const enriched = chooseDescription(job, candidates, { tried: detail !== null || page.kind === "page" || page.kind === "failed", error: detail?.error ?? pageError }, new Date(now()));

  const verification = verifyPosting(job, page, new Date(now()));
  const base = assessPosting({ ...job, description: enriched.description, descriptionTruncated: enriched.descriptionTruncated }, new Date(now()));
  const closed = isClosedState(verification.state);

  return {
    ...enriched,
    verification,
    postingStatus: closed ? "expired" : base.status,
    postingNotes: [...(closed ? verification.notes : []), ...base.notes].slice(0, 5),
  };
}
