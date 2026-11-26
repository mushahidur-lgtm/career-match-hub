import { compareByFit } from "@/lib/search/rank";
import type { Job, Salary, SortKey } from "@/types/job";

export function formatSalary(s: Salary | null): string {
  if (!s || (s.min === null && s.max === null)) return "Salary unknown";
  const money = (n: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: s.currency, maximumFractionDigits: 0 }).format(n);
  const unit = s.period === "hour" ? "/hr" : "/yr";
  const range = s.min !== null && s.max !== null && s.min !== s.max ? `${money(s.min)} to ${money(s.max)}` : money((s.max ?? s.min)!);
  return `${range}${unit}${s.estimated ? " (estimated)" : ""}`;
}

/** Best-case yearly figure, so hourly and yearly pay can be compared. */
export function yearlySalary(job: Job): number | null {
  const s = job.salary;
  const best = s ? (s.max ?? s.min) : null;
  if (best === null || !s) return null;
  return s.period === "hour" ? best * 2080 : best;
}

export function formatPosted(iso: string | null, now = Date.now()): string {
  if (!iso) return "Date not listed";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Date not listed";
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function sortJobs(jobs: Job[], key: SortKey): Job[] {
  const copy = [...jobs];
  const date = (j: Job) => (j.postedAt ? Date.parse(j.postedAt) || 0 : 0);
  if (key === "newest") copy.sort((a, b) => date(b) - date(a));
  else if (key === "salary") copy.sort((a, b) => (yearlySalary(b) ?? -1) - (yearlySalary(a) ?? -1));
  else if (key === "company") copy.sort((a, b) => a.company.localeCompare(b.company));
  // "Highest match" keeps the server's order: jobs to verify come after those you can apply to.
  else copy.sort(compareByFit);
  return copy;
}

export type ScoreTone = "good" | "info" | "warn";
export const scoreTone = (score: number): ScoreTone => (score >= 90 ? "good" : score >= 70 ? "info" : "warn");

/** Stops a spreadsheet from running a cell that starts with a formula character. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
