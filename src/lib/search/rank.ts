import type { Job } from "@/types/job";

/**
 * Ranking order: jobs you are eligible for by fit, then those to verify. Jobs ruled out by a confirmed
 * eligibility mismatch, or whose posting is closed, are kept apart with the reason.
 */

/** 0 recommend, 1 verify first, 2 ruled out. Used by the server and by the results list so both agree. */
export function rankTier(job: Pick<Job, "match" | "postingStatus">): 0 | 1 | 2 {
  const eligibility = job.match?.eligibility?.status;
  if (eligibility === "not_eligible" || job.match?.postingStatus === "expired" || job.postingStatus === "expired") return 2;
  return eligibility === "needs_verification" ? 1 : 0;
}

export const compareByFit = (a: Pick<Job, "match" | "postingStatus">, b: Pick<Job, "match" | "postingStatus">) =>
  rankTier(a) - rankTier(b) || (b.match?.score ?? -1) - (a.match?.score ?? -1);

export function splitRanked(jobs: Job[]): { ranked: Job[]; excluded: Job[] } {
  const sorted = [...jobs].sort(compareByFit);
  return { ranked: sorted.filter((j) => rankTier(j) < 2), excluded: sorted.filter((j) => rankTier(j) === 2) };
}

/** Why a job is in the excluded section. */
export function exclusionReason(job: Pick<Job, "match" | "postingStatus" | "postingNotes">): string {
  if (job.match?.eligibility?.status === "not_eligible") return job.match.eligibility.reason;
  return job.postingNotes?.length ? `Posting closed: ${job.postingNotes.join(". ")}.` : "The posting appears to be closed.";
}
