import { descriptionInfo, likelyClosed } from "@/lib/job-quality";
import type { Job, PostingStatus } from "@/types/job";

/**
 * What state the posting itself is in. This is never part of the match score. Nothing here visits a page:
 * "unreachable" is only for code that actually tried to fetch and failed.
 */
export interface PostingAssessment {
  status: PostingStatus;
  notes: string[];
}

const CLOSED_REASON = /posting text says/i;

export function assessPosting(
  job: Pick<Job, "description" | "descriptionTruncated" | "postedAt" | "source" | "applyUrl"> & { expiresAt?: string | null },
  now = new Date(),
): PostingAssessment {
  const closed = likelyClosed(job, now);
  const info = descriptionInfo(job);
  const expiry = job.expiresAt ? Date.parse(job.expiresAt) : Number.NaN;

  // Age alone is a hint to check, never proof that a posting has closed.
  const notes = [...closed.reasons];
  if (Number.isFinite(expiry) && expiry < now.getTime()) {
    notes.push("The job board's closing date has passed");
    return { status: "expired", notes };
  }
  if (closed.reasons.some((r) => CLOSED_REASON.test(r))) return { status: "expired", notes };
  if (job.source === "demo" || job.source === "manual") {
    notes.push(job.source === "demo" ? "A sample listing, not a real job" : "Added by hand, not retrieved from a job board");
    return { status: "unverified", notes };
  }
  if (info.level !== "full") {
    notes.push(info.level === "partial" ? "Only the start of the description was returned" : "The description is very short");
    return { status: "partial", notes };
  }
  if (!job.applyUrl) notes.push("No apply link");
  return { status: "retrieved", notes };
}
