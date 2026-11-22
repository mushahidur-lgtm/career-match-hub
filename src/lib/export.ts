import { csvCell, formatSalary } from "@/lib/format";
import { freshness, levelBucket } from "@/lib/job-meta";
import type { ApplicationStatus, Job } from "@/types/job";

/** The jobs on screen as a spreadsheet. Every value is exactly what the listing says; nothing is filled in. */
export function jobsToCsv(jobs: Job[], statusOf: (job: Job) => ApplicationStatus | null, now = new Date()): string {
  const header = [
    "Title", "Company", "Location", "Work mode", "Employment type", "Level asked", "Salary", "Match score", "Confidence",
    "Posted", "Age", "Status", "Source", "Also listed", "Apply link",
  ];
  const rows = jobs.map((j) => [
    j.title,
    j.company,
    j.location,
    j.workMode,
    j.employmentType,
    levelBucket(j),
    formatSalary(j.salary),
    j.match?.score ?? "",
    j.match?.detail?.confidence ?? "",
    j.postedAt?.slice(0, 10) ?? "",
    freshness(j.postedAt, now).label,
    statusOf(j) ?? "",
    j.source,
    j.duplicateCount ?? 0,
    j.applyUrl ?? "",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
