import type { JobCheck } from "@/lib/jobs/check";
import { scoreJob, type MatchInput } from "@/lib/matching/engine";
import type { DescriptionStatus, Job, VerificationState } from "@/types/job";

/** Puts what a posting check found onto the job, and re-runs the rules when that changes what they read. */

export const DESCRIPTION_LABEL: Record<DescriptionStatus, string> = {
  full: "Full description",
  partially_enriched: "Partially enriched",
  provider_only: "Job board description only",
  incomplete: "Incomplete description",
  failed: "Retrieval failed",
  not_attempted: "Fuller description not attempted",
};

export const VERIFICATION_LABEL: Record<VerificationState, [string, "good" | "info" | "warn" | "neutral"]> = {
  verified_active: ["Verified active", "good"],
  partially_verified: ["Partially verified", "info"],
  unverified: ["Not verified", "neutral"],
  expired: ["Expired", "warn"],
  closed: ["Closed", "warn"],
  link_unavailable: ["Apply link unavailable", "warn"],
  verification_failed: ["Check failed", "neutral"],
};

export function applyCheck(job: Job, check: JobCheck, input: MatchInput | null, aiAvailable: boolean): Job {
  const next: Job = {
    ...job,
    description: check.description,
    descriptionTruncated: check.descriptionTruncated,
    enrichment: check.enrichment,
    verification: check.verification,
    postingStatus: check.postingStatus,
    postingNotes: check.postingNotes,
  };
  const reread = check.description !== job.description || check.postingStatus !== (job.postingStatus ?? job.match?.postingStatus);
  if (!reread || !input || !job.match) return next;
  const match = scoreJob(next, input);
  // The earlier AI review read a different posting, so it is not carried over.
  return { ...next, match: { ...match, ai: { status: aiAvailable ? "not_shortlisted" : "unavailable" } } };
}
