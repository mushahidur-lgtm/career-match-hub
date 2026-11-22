import { yearlySalary } from "@/lib/format";
import type { Job } from "@/types/job";

const COMPANY_SUFFIX = /\b(?:incorporated|inc|ltd|limited|corp|corporation|co|company|llc|llp|plc|lp|ulc|gmbh)\b/g;

/** "Acme Inc." and "ACME, Incorporated" are the same employer. */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMPANY_SUFFIX, " ")
    .replace(/\bcanada\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops work-mode and contract tags that postings add to the same title. Keeps the level, since "Senior" is a different job. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\bsr\.?(?=\s)/g, "senior")
    .replace(/\bjr\.?(?=\s)/g, "junior")
    .replace(/&/g, " and ")
    .replace(/\b(?:remote|hybrid|on-?site|full[- ]?time|part[- ]?time|permanent|contract|temporary)\b/g, " ")
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const cityOf = (location: string) => {
  const first = location.split(",")[0].trim().toLowerCase();
  return /^remote\b/.test(first) ? "remote" : first;
};

/** Same employer, title and city means the same posting. Returns null when the employer is unknown, so unrelated jobs are never merged. */
export function duplicateKey(job: Pick<Job, "title" | "company" | "location">): string | null {
  // Checked on the raw name: normalising would strip "Company" and leave "not listed".
  if (!job.company.trim() || /^company not listed$/i.test(job.company.trim())) return null;
  const company = normalizeCompany(job.company);
  if (!company) return null;
  return `${normalizeTitle(job.title)}|${company}|${cityOf(job.location)}`;
}

const richness = (j: Job) =>
  (j.salary && !j.salary.estimated ? 4 : j.salary ? 1 : 0) + (j.applyUrl ? 2 : 0) + Math.min(3, Math.floor(j.description.length / 800)) + (j.postedAt ? 1 : 0);

const MAX_OTHER_LINKS = 3;

/**
 * Merges listings of the same posting into one. The most complete listing is kept, a stated salary
 * is carried over if the kept one lacks it, and the others' apply links are remembered. Nothing
 * is invented: dates stay as the kept listing had them, and a truncated description is replaced only by another
 * listing's complete one, never combined or rewritten.
 */
export function mergeDuplicates(jobs: Job[]): Job[] {
  const groups = new Map<string, Job[]>();
  const order: string[] = [];
  const seenIds = new Set<string>();

  for (const job of jobs) {
    if (seenIds.has(job.id)) continue;
    seenIds.add(job.id);
    const key = duplicateKey(job) ?? `id:${job.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(job);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    const sorted = [...group].sort((a, b) => richness(b) - richness(a));
    const [winner, ...rest] = sorted;
    const donor = !winner.salary || winner.salary.estimated ? rest.find((j) => j.salary && !j.salary.estimated && yearlySalary(j) !== null) : undefined;
    const urls = [...new Set(rest.map((j) => j.applyUrl).filter((u): u is string => !!u && u !== winner.applyUrl))].slice(0, MAX_OTHER_LINKS);
    // A board that shares only the start of a posting loses to another that shares the whole text. The text is that listing's own, word for word.
    const fuller = winner.descriptionTruncated || winner.description.length < 400 ? rest.filter((j) => !j.descriptionTruncated && j.description.length > winner.description.length + 200).sort((a, b) => b.description.length - a.description.length)[0] : undefined;
    return {
      ...winner,
      ...(fuller ? { description: fuller.description, descriptionTruncated: false } : {}),
      salary: donor ? donor.salary : winner.salary,
      duplicateCount: rest.length,
      ...(urls.length ? { otherApplyUrls: urls } : {}),
    };
  });
}
