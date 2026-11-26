import { CLOSED_TEXT } from "@/lib/job-quality";
import { titleSimilarity } from "@/lib/matching/engine";
import { stripHtml } from "@/lib/providers/common";
import type { Job, Verification, VerificationState } from "@/types/job";
import type { PageResult } from "./job-page";
import { readJobPostings, type StructuredPosting } from "./jsonld";

/**
 * What can be said about whether a job is still open. "Closed" and "expired" need positive evidence from the
 * page. Being blocked, timed out or unreadable is a failed check, never a closed job. "Verified active" needs
 * the page to publish this job as an open posting.
 */

const CHALLENGE = /captcha|are you (?:a )?human|verify you are human|cf-challenge|challenge-platform|<title>\s*just a moment/i;
export const SAME_JOB = 0.6;

export const samePosting = (jobTitle: string, found: StructuredPosting) => titleSimilarity(found.title, [jobTitle]) >= SAME_JOB;

const FAILURES: Record<string, string> = {
  blocked_url: "The apply address is not a public web page, so it was not opened.",
  dns: "The site's address could not be found. This may be temporary.",
  timeout: "The site did not answer in time.",
  network: "The site could not be reached.",
  too_large: "The page was too large to check.",
  bad_content: "The link leads to something other than a web page.",
  too_many_redirects: "The link redirects too many times to follow.",
};

/** A job's path, as opposed to a careers home page that every removed job lands on. */
const isGeneralPage = (url: string) => {
  try {
    return /^\/?(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:careers?|jobs?|search|openings|opportunities|vacancies)?\/?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

export function verifyPosting(job: Pick<Job, "title" | "applyUrl" | "source">, result: PageResult, now = new Date()): Verification {
  const make = (state: VerificationState, note: string, extra: Partial<Verification> = {}): Verification => ({
    state,
    checkedAt: "checkedAt" in result ? result.checkedAt : now.toISOString(),
    notes: [note],
    ...extra,
  });

  switch (result.kind) {
    case "no_link":
      return make("link_unavailable", "The listing has no apply link.");
    case "disabled":
      return make("unverified", "Page checks are switched off on this site. Open the link to see whether the job is still posted.");
    case "not_fetchable":
      return make("unverified", "This app only reads known job application systems, and the link is not one of them. Open it to check.");
    case "robots":
      return make("unverified", "The site asks automated tools not to read this page. Open it to check.");
    case "failed":
      return make(result.failure === "blocked_url" ? "link_unavailable" : "verification_failed", FAILURES[result.failure]);
  }

  const { page } = result;
  const finalUrl = page.redirected ? { finalUrl: page.url } : {};
  if (page.status === 410) return make("closed", "The site says this posting has been removed (410 Gone).", finalUrl);
  if (page.status === 404) return make("link_unavailable", "The page was not found (404). The posting may have been removed, or the link may be broken.", finalUrl);
  if (page.status >= 300 && page.status < 400) return make("unverified", "The link redirects to a site this app does not read. Open it to check.", finalUrl);
  if (page.status !== 200) return make("verification_failed", `The site did not allow the check (status ${page.status}). That says nothing about whether the job is open.`, finalUrl);

  const posting = readJobPostings(page.body).find((p) => samePosting(job.title, p));
  if (!posting && CHALLENGE.test(page.body)) return make("verification_failed", "The site asked for a human check, so the page could not be read.", finalUrl);

  if (posting?.validThrough) {
    // A bare date means the posting is open through that day.
    const end = Date.parse(posting.validThrough.length === 10 ? `${posting.validThrough}T23:59:59` : posting.validThrough);
    if (Number.isFinite(end) && end < now.getTime()) return make("expired", `The employer's page gives a closing date that has passed (${posting.validThrough.slice(0, 10)}).`, finalUrl);
  }
  const visible = stripHtml(page.body);
  if (CLOSED_TEXT.test(visible)) return make("closed", "The page says the position is closed or no longer accepting applications.", finalUrl);
  if (posting) return make("verified_active", "The employer's page publishes this job as an open posting.", finalUrl);
  if (page.redirected && job.applyUrl && !isGeneralPage(job.applyUrl) && isGeneralPage(page.url)) {
    return make("link_unavailable", "The link now leads to a general careers page. The posting may have been removed.", finalUrl);
  }
  return visible.toLowerCase().includes(job.title.toLowerCase())
    ? make("partially_verified", "The page loads and names this job, but does not state that it is still open.", finalUrl)
    : make("unverified", "The page loads but does not clearly show this job.", finalUrl);
}

/** States that mean the job should not be presented as something to apply to. */
export const isClosedState = (state: VerificationState | undefined) => state === "closed" || state === "expired";
