import { applyLinkInfo, descriptionInfo } from "@/lib/job-quality";
import type { Job } from "@/types/job";
import { analyzePosting } from "./extract";

/**
 * Why a lookup showed nobody, and what to do next, from facts about the job. Used when no web search is available (or it
 * found nothing), so an empty result is never a dead end. It states only what was actually checked.
 */

export interface Diagnosis {
  /** What was checked, so the person knows what "nothing found" covers. */
  checked: string[];
  /** Why the result is empty, most important first. */
  reasons: string[];
  /** The one thing most worth doing next. */
  next: string;
  /** Shared addresses or numbers the posting prints. Mailboxes, not people. */
  shared: { emails: string[]; phones: string[] };
  /** The full posting, when the listing is partial and the link goes somewhere the person can read it. */
  inspectUrl: string | null;
}

export function diagnoseNoResult(job: Pick<Job, "company" | "description" | "descriptionTruncated" | "applyUrl" | "source">, opts: { webSearchRan: boolean }): Diagnosis {
  const info = descriptionInfo(job);
  const link = applyLinkInfo(job);
  const companyKnown = !/^company not listed$/i.test(job.company.trim()) && job.company.trim().length > 0;
  const { shared } = analyzePosting(job.description, job.company);

  const checked = [`The job posting text from ${job.source === "manual" ? "your entry" : "the job board"} (${info.chars.toLocaleString()} characters)`];
  if (opts.webSearchRan) checked.push("A web search for people named by public pages");
  else checked.push("No web search was run: it needs an AI key on this site, and everything above is free");

  const reasons: string[] = [];
  if (!companyKnown) reasons.push("The posting does not name the employer, so there is no company to search for.");
  if (info.level === "partial") reasons.push(`The job board returned only the start of this posting (${info.chars.toLocaleString()} characters). A contact named further down would not be seen here.`);
  else if (info.level === "short") reasons.push(`The posting text is short (${info.chars.toLocaleString()} characters), and postings this brief rarely name anyone.`);
  reasons.push("The posting text names no recruiter, HR contact or hiring manager.");
  if (shared.emails.length || shared.phones.length) {
    reasons.push(`It does print a shared contact (${[...shared.emails, ...shared.phones].join(", ")}). That is a mailbox or switchboard, not a named person.`);
  }

  const canInspect = info.level !== "full" && link.kind !== "none";
  let next: string;
  if (!companyKnown) next = "Open the original posting to find the employer's name, then search for that employer.";
  else if (canInspect) next = "Open the full posting yourself and look for a named contact, then use the searches below.";
  else if (link.kind === "none") next = "Search the employer's careers page for this job, then use the searches below to find the recruiter.";
  else next = "Use the searches below to look for the recruiter and hiring manager, then save anyone you find with their source.";

  return { checked, reasons, next, shared, inspectUrl: canInspect ? job.applyUrl : null };
}
