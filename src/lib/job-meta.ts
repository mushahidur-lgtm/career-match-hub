import { levelFromYears, titleLevel } from "@/lib/matching/engine";
import { parseRequirements } from "@/lib/matching/requirements";
import type { Job } from "@/types/job";

/* ---------- freshness ---------- */

export type FreshnessLevel = "new" | "recent" | "aging" | "stale" | "unknown";

export interface Freshness {
  level: FreshnessLevel;
  /** Whole days since the posting date, or null when the posting gives no date. */
  days: number | null;
  label: string;
  /** Shown for postings old enough that they may have closed. */
  note: string | null;
}

const DAY = 86_400_000;
export const STALE_AFTER_DAYS = 30;

/**
 * How old a posting is, from the date the job board gave. A missing date stays "unknown": it is
 * never guessed. Age is only a hint that a posting may have closed; no job board tells us that.
 */
export function freshness(postedAt: string | null, now = new Date()): Freshness {
  const t = postedAt ? Date.parse(postedAt) : NaN;
  if (Number.isNaN(t)) return { level: "unknown", days: null, label: "Date not listed", note: null };
  const days = Math.max(0, Math.floor((now.getTime() - t) / DAY));
  if (days <= 2) return { level: "new", days, label: days === 0 ? "Posted today" : `Posted ${days} ${days === 1 ? "day" : "days"} ago`, note: null };
  if (days <= 14) return { level: "recent", days, label: `Posted ${days} days ago`, note: null };
  if (days <= STALE_AFTER_DAYS) return { level: "aging", days, label: `Posted ${days} days ago`, note: null };
  return {
    level: "stale",
    days,
    label: `Posted ${days} days ago`,
    note: `This posting is ${days} days old and may no longer be open. Confirm on the employer's site before applying.`,
  };
}

/* ---------- seniority of a posting ---------- */

export const LEVEL_BUCKETS = ["Entry or junior", "Mid-level", "Senior", "Lead or above", "Not stated"] as const;
export type LevelBucket = (typeof LEVEL_BUCKETS)[number];

/** The level a posting asks for, from its title, or from the years of experience it requires. */
export function levelBucket(job: Pick<Job, "title" | "description">): LevelBucket {
  let level = titleLevel(job.title);
  if (level === null) {
    const years = parseRequirements(job.title, job.description).requiredYears;
    if (years) level = levelFromYears(years);
  }
  if (level === null) return "Not stated";
  return level <= 1 ? "Entry or junior" : level === 2 ? "Mid-level" : level === 3 ? "Senior" : "Lead or above";
}
