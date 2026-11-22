import { csvCell, formatSalary } from "@/lib/format";
import { freshness, levelBucket } from "@/lib/job-meta";
import { nextInterview } from "@/lib/applications";
import type { Application, ApplicationStatus, Job } from "@/types/job";

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

/** Your applications as a spreadsheet: every field you recorded, and nothing you did not. */
export function applicationsToCsv(items: Application[], now = new Date()): string {
  const header = [
    "Title", "Company", "Location", "Stage", "Match score", "Applied on", "Resume used", "Follow up on", "Apply by",
    "Expect a reply by", "Next interview", "Interviews", "Recruiter", "Recruiter email", "Recruiter phone",
    "Salary expectation", "Offer salary", "Offer decide by", "Rejection reason", "Notes", "Added on", "Job link",
  ];
  const rows = items.map((a) => [
    a.job.title,
    a.job.company,
    a.job.location,
    a.status,
    a.job.match?.score ?? "",
    a.appliedAt ?? "",
    a.resumeName ?? "",
    a.followUpDate ?? "",
    a.deadline ?? "",
    a.responseDue ?? "",
    nextInterview(a, now)?.at?.replace("T", " ") ?? "",
    a.interviews?.length ?? 0,
    a.recruiter?.name ?? "",
    a.recruiter?.email ?? "",
    a.recruiter?.phone ?? "",
    a.salaryExpectation ?? "",
    a.offer?.salary ?? "",
    a.offer?.decideBy ?? "",
    a.rejectionReason ?? "",
    a.notes,
    a.savedAt.slice(0, 10),
    a.job.applyUrl ?? "",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
