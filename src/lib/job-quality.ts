import { normalizeCompany } from "@/lib/dedupe";
import { freshness } from "@/lib/job-meta";
import type { Job } from "@/types/job";

/**
 * What can honestly be said about how complete and trustworthy a listing is, from what the job board returned.
 * Nothing here visits the posting or the employer's site, and nothing is guessed: each answer says what it is based on.
 */

/* ---------- how much of the posting we have ---------- */

export type Completeness = "full" | "partial" | "short";

export interface DescriptionInfo {
  level: Completeness;
  chars: number;
  label: string;
  /** Why this matters, shown where a person might otherwise expect more. */
  note: string | null;
}

/** Below this the posting is too brief to name anyone or list many requirements, even if the board says it is whole. */
export const SHORT_DESCRIPTION = 400;

export function descriptionInfo(job: Pick<Job, "description" | "descriptionTruncated">): DescriptionInfo {
  const chars = job.description.trim().length;
  if (job.descriptionTruncated) {
    return {
      level: "partial",
      chars,
      label: "Partial description",
      note: "The job board returned only the start of this posting. Skills, requirements and any named contact further down are missing here. Open the full posting to read the rest.",
    };
  }
  if (chars < SHORT_DESCRIPTION) {
    return { level: "short", chars, label: "Short description", note: "The posting text is brief, so it may not mention a recruiter or hiring manager." };
  }
  return { level: "full", chars, label: "Full description", note: null };
}

/* ---------- where the apply link goes ---------- */

export type LinkKind = "none" | "employer" | "tracking-system" | "job-board" | "redirect" | "unknown";

export interface ApplyLinkInfo {
  kind: LinkKind;
  host: string | null;
  label: string;
  note: string | null;
  /** True when the link is likely to go straight to the employer or its application system. */
  direct: boolean;
}

/** Sites that list jobs for many employers. */
const BOARD_HOSTS = ["indeed.", "linkedin.com", "glassdoor.", "ziprecruiter.", "monster.", "jooble.", "talent.com", "careerjet.", "jobbank.gc.ca", "workopolis.", "simplyhired.", "neuvoo.", "jobrapido.", "learn4good.", "jobtome."];
/** The systems employers use to take applications. */
const TRACKING_HOSTS = ["greenhouse.io", "lever.co", "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "ashbyhq.com", "icims.com", "taleo.net", "bamboohr.com", "jobvite.com", "successfactors.", "oraclecloud.com", "ultipro.com", "dayforcehr.com", "paylocity.com", "applytojob.com", "breezy.hr", "recruitee.com", "workable.com", "jazz.co", "jobs.gc.ca", "jobs-emplois.gc.ca", "emploisfp-psjobs.cfp-psc.gc.ca", "gojobs.gov.on.ca"];

const hostOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

const has = (host: string, list: string[]) => list.some((h) => (h.endsWith(".") ? host.includes(h) : host === h || host.endsWith(`.${h}`)));

export function applyLinkInfo(job: Pick<Job, "applyUrl" | "company" | "source">): ApplyLinkInfo {
  const host = hostOf(job.applyUrl);
  if (!host) {
    return { kind: "none", host: null, label: "No apply link", note: "The listing has no usable apply link. Search the employer's careers page for this job.", direct: false };
  }
  if (/(?:^|\.)adzuna\./.test(host)) {
    return { kind: "redirect", host, label: "Adzuna redirect", note: "This link goes through Adzuna first. It can stop working once the posting closes, and the employer's own page may be better to apply on.", direct: false };
  }
  if (has(host, BOARD_HOSTS)) {
    return { kind: "job-board", host, label: `Job board (${host})`, note: "A job board page, not the employer's own site.", direct: false };
  }
  if (has(host, TRACKING_HOSTS)) {
    return { kind: "tracking-system", host, label: `Employer application system (${host})`, note: null, direct: true };
  }
  const token = normalizeCompany(job.company).split(" ").find((w) => w.length >= 4);
  if (token && host.replace(/[^a-z0-9]/g, "").includes(token.replace(/[^a-z0-9]/g, ""))) {
    return { kind: "employer", host, label: `Employer site (${host})`, note: null, direct: true };
  }
  return { kind: "unknown", host, label: `Other site (${host})`, note: "This address does not clearly belong to the employer. Check where it leads before sharing details.", direct: false };
}

/* ---------- whether it may be closed ---------- */

export interface ClosedInfo {
  closed: boolean;
  reasons: string[];
}

export const CLOSED_TEXT = /\b(?:no longer (?:accepting|available|open)|(?:position|job|posting|role|vacancy) (?:has been|is|was) (?:filled|closed|cancel+ed)|(?:this )?(?:job|posting|position|competition) (?:has )?(?:expired|closed)|applications? (?:are |is |have |has )?(?:now )?closed|(?:is|are) no longer (?:hiring|recruiting))\b/i;

/**
 * A posting is "likely closed" when it is old (no job board says when one closes, so age is only a hint), or when its own
 * text says so. This is a hint to check, never a claim: the reasons are listed so the person can judge.
 */
export function likelyClosed(job: Pick<Job, "postedAt" | "description">, now = new Date()): ClosedInfo {
  const reasons: string[] = [];
  const f = freshness(job.postedAt, now);
  if (f.level === "stale") reasons.push(`Posted ${f.days} days ago`);
  if (CLOSED_TEXT.test(job.description)) reasons.push("The posting text says it is closed or no longer accepting applications");
  return { closed: reasons.length > 0, reasons };
}
