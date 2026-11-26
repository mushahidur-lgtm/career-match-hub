import type {
  EmploymentType,
  EmploymentTypeFilter,
  Job,
  JobCategory,
  SearchFilters,
  WorkMode,
} from "@/types/job";

import { mergeDuplicates } from "@/lib/dedupe";
import type { ProviderFailure } from "./health";
import { yearlySalary } from "@/lib/format";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly failure: ProviderFailure = "unreachable",
  ) {
    super(message);
  }
}

export const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
const US_STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

export const isRemoteLocation = (location: string) => /^remote\b/i.test(location.trim());

/** Countries to search for a location string. Remote - Anywhere searches both. */
export function countriesFor(location: string): ("ca" | "us")[] {
  const l = location.trim();
  if (/anywhere/i.test(l)) return ["ca", "us"];
  if (/canada/i.test(l)) return ["ca"];
  const code = l.match(/,\s*([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase();
  if (/\b(usa|united states|u\.s\.)\b/i.test(l) || (code && US_STATES.includes(code) && !CA_PROVINCES.includes(code))) return ["us"];
  return ["ca"];
}

export const cityOf = (location: string) => location.split(",")[0].trim();

/** Replaces until nothing changes, because removing one match can join the pieces of another. */
function removeAll(text: string, pattern: RegExp): string {
  let out = text;
  let before: string;
  do {
    before = out;
    out = out.replace(pattern, "");
  } while (out !== before);
  return out;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** Removes markup without touching entities. Safe to run again on text that has already been decoded once. */
export function stripTags(html: string): string {
  // Comments and script or style blocks are never visible to a reader, so their text is not part of the posting.
  const visible = removeAll(html, /<!--[\s\S]*?(?:-->|$)|<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)
    .replace(/<\s*(?:br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  // Whole tags go; a tag that is never closed loses its angle bracket. A "<" in ordinary text, as in "< 5", stays.
  return removeAll(visible, /<[^>]+>|<(?=[a-zA-Z!/?])/g)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripHtml(html: string): string {
  // One pass, so "&amp;lt;" reads as the text "&lt;" and is not decoded twice.
  return stripTags(html)
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity])
    .trim();
}

export function inferWorkMode(title: string, description: string, remoteFlag?: boolean): WorkMode {
  const text = `${title}\n${description}`;
  if (/\bhybrid\b/i.test(text)) return "Hybrid";
  const notRemote = /\b(?:not|no)\b[^.\n]{0,20}\b(?:a )?(?:fully )?remote\b|\bremote (?:work )?is not\b|\bno (?:remote|work[- ]from[- ]home)\b/i;
  const remoteText = text.replace(new RegExp(notRemote, "gi"), " ");
  if (remoteFlag || /\bremote\b|work from home|work-from-home|telecommut|\bWFH\b/i.test(remoteText)) return "Remote";
  if (/\bon-?site\b|in[- ]office|in[- ]person/i.test(text)) return "On-site";
  return "Not stated";
}

export function inferEmploymentType(title: string, description: string): EmploymentType {
  const t = `${title}\n${description.slice(0, 1500)}`;
  if (/\b(?:intern|internship|co-?op)\b/i.test(title)) return "Internship";
  if (/\bcontract(?:or)?\b|\bfreelance\b|\bC2C\b|\bcorp[- ]to[- ]corp\b|\bfixed[- ]term\b|\btemp(?:orary)?\b|\b\d+[- ]month\b/i.test(t)) return "Contract";
  if (/\bpart[- ]time\b/i.test(t)) return "Part-time";
  if (/\bfull[- ]time\b|\bpermanent\b/i.test(t)) return "Full-time";
  return "Not stated";
}

const CATEGORY_RULES: [JobCategory, RegExp][] = [
  ["AI and machine learning", /\b(?:machine learning|ml|ai|artificial intelligence|llm|nlp|data scientist|deep learning|computer vision)\b/i],
  ["Cybersecurity", /\b(?:security|cyber|infosec|penetration|soc analyst|iam)\b/i],
  ["QA and testing", /\b(?:qa|quality assurance|tester|test automation|sdet|testing)\b/i],
  ["Cloud and DevOps", /\b(?:devops|sre|site reliability|cloud|platform engineer|infrastructure|kubernetes|systems? (?:engineer|administrator))\b/i],
  ["Data and analytics", /\b(?:data|bi|business intelligence|analytics|etl|dba|database|reporting|power bi|tableau|analyst)\b/i],
  ["Design", /\b(?:designer|ux|ui\/ux|product design)\b/i],
  ["Product and projects", /\b(?:product (?:manager|owner)|project manager|program manager|scrum master|delivery manager|business analyst)\b/i],
  ["IT and support", /\b(?:help ?desk|it support|desktop support|technical support|service desk|network|sysadmin|it technician)\b/i],
  ["Business and finance", /\b(?:finance|financial|accountant|accounting|fp&a|controller|auditor|procurement)\b/i],
  ["Software engineering", /\b(?:software|developer|engineer|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|\.net|java|python|react|web)\b/i],
];

export function inferCategory(title: string, description = ""): JobCategory {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(title)) return cat;
  const snippet = description.slice(0, 400);
  for (const [cat, re] of CATEGORY_RULES) if (re.test(snippet)) return cat;
  return "Other";
}

/** A posting that does not state its employment type is kept, so it can be checked by hand. */
export function employmentMatches(job: Pick<Job, "employmentType">, filter: EmploymentTypeFilter): boolean {
  if (filter === "All" || job.employmentType === "Not stated") return true;
  if (filter === "Permanent full-time") return job.employmentType === "Full-time";
  return job.employmentType === filter;
}

/** Drops jobs that clearly contradict a filter. A job that does not state a value is kept. */
export function applyFilters(jobs: Job[], f: SearchFilters): Job[] {
  return jobs.filter((job) => {
    if (f.category !== "All" && job.category !== f.category) return false;
    if (f.workMode !== "All") {
      const ok =
        job.workMode === f.workMode || (f.workMode === "On-site" && job.workMode === "Not stated");
      if (!ok) return false;
    }
    if (!employmentMatches(job, f.employmentType)) return false;
    // A figure Adzuna predicted is a guess, not a stated salary, so it never excludes a job.
    if (f.minSalary && job.salary && !job.salary.estimated) {
      const y = yearlySalary(job);
      if (y !== null && y < f.minSalary) return false;
    }
    return true;
  });
}

/** Two short attempts keep a search inside the route's time limit alongside the AI review. */
const PROVIDER_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 400;

async function once(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ProviderError(`${label} ${timedOut ? "did not answer in time" : "could not be reached"}.`, timedOut ? "timeout" : "unreachable");
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, label: string): Promise<T> {
  let res: Response | null = null;
  // A dropped connection or a server fault is worth one more try. Rejected keys and rate limits are not:
  // asking again would only spend quota.
  for (let attempt = 1; ; attempt++) {
    try {
      res = await once(url, init, label);
      if (res.status < 500 || attempt === 2) break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${label} rejected the API credentials.`, "auth");
  if (res.status === 429) throw new ProviderError(`${label} rate limit reached.`, "rate_limit");
  if (!res.ok) throw new ProviderError(`${label} returned an error (${res.status}).`, "server");
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(`${label} returned an unreadable response.`, "bad_response");
  }
}

/** Keeps what answered when one of several requests fails. Throws only when none succeeded. */
export async function settleSome<T>(runs: Promise<T[]>[]): Promise<T[]> {
  const results = await Promise.allSettled(runs);
  const ok = results.filter((r): r is PromiseFulfilledResult<T[]> => r.status === "fulfilled");
  if (!ok.length && results.length) throw (results[0] as PromiseRejectedResult).reason;
  return ok.flatMap((r) => r.value);
}

/** Merges listings of the same posting. See lib/dedupe.ts. */
export const dedupeJobs = mergeDuplicates;
