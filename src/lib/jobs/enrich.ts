import { SHORT_DESCRIPTION } from "@/lib/job-quality";
import type { DescriptionSource, DescriptionStatus, Enrichment, Job } from "@/types/job";
import type { PageResult } from "./job-page";
import { samePosting } from "./verify";

/**
 * Picks the most complete trustworthy description of one job. The chosen text is one source's, word for word:
 * sources are never combined or rewritten.
 */

export type EnrichableJob = Pick<Job, "title" | "description" | "descriptionTruncated">;

export interface Candidate {
  source: DescriptionSource;
  text: string;
}

export interface Enriched {
  description: string;
  descriptionTruncated: boolean;
  enrichment: Enrichment;
}

/** A new text must add at least this much to replace the one we have. */
const GAIN = 200;
const FULL_ENOUGH = 800;
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** What the employer's page offers for this job, if it is demonstrably the same job. */
export function pageCandidates(job: EnrichableJob, result: PageResult): Candidate[] {
  if (result.kind !== "page" || result.page.status !== 200) return [];
  const out: Candidate[] = result.page.postings
    .filter((p) => samePosting(job.title, p))
    .map((p) => ({ source: "json_ld" as const, text: p.description }));
  // Page text is trusted only when it contains the opening of the description we already hold.
  const opening = squash(job.description).replace(/(?:…|\.\.\.)$/, "").slice(0, 80);
  const main = result.page.main;
  if (main && opening.length >= 40 && squash(main).includes(opening)) out.push({ source: "employer_page", text: main });
  return out;
}

export function chooseDescription(job: EnrichableJob, candidates: Candidate[], attempt: { tried: boolean; error?: string }, now = new Date()): Enriched {
  const original = job.description;
  const originalFull = !job.descriptionTruncated && original.length >= SHORT_DESCRIPTION;
  const need = job.descriptionTruncated ? original.length + GAIN : Math.max(original.length + GAIN, SHORT_DESCRIPTION);
  // Sources are listed in order of trust; a later one wins only by being substantially longer.
  const order: DescriptionSource[] = ["provider_detail", "json_ld", "employer_page"];
  const best = candidates
    .filter((c) => c.text.length >= need)
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
    .reduce<Candidate | null>((top, c) => (!top || c.text.length > top.text.length * 1.25 ? c : top), null);

  const description = best?.text ?? original;
  const truncated = best ? false : job.descriptionTruncated;
  let status: DescriptionStatus;
  if (best) status = best.source !== "employer_page" && best.text.length >= FULL_ENOUGH ? "full" : "partially_enriched";
  else if (originalFull) status = "full";
  else if (!attempt.tried) status = "not_attempted";
  else if (attempt.error) status = "failed";
  else status = job.descriptionTruncated || original.length < SHORT_DESCRIPTION ? "incomplete" : "provider_only";

  return {
    description,
    descriptionTruncated: truncated,
    enrichment: {
      status,
      originalLength: original.length,
      enrichedLength: description.length,
      source: best?.source ?? "provider",
      retrievedAt: now.toISOString(),
      truncated,
      ...(attempt.error && !best ? { error: attempt.error } : {}),
    },
  };
}
