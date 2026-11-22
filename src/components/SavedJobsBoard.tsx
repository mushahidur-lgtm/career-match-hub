"use client";

import { useState } from "react";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { formatSalary, savedJobsToCsv } from "@/lib/format";
import { APPLICATION_STATUSES, type ApplicationStatus, type SavedJob } from "@/types/job";
import { safeUrl } from "./job-parts";
import { Badge, ScoreBadge, inputClass, secondaryButton } from "./ui";

interface Props {
  items: SavedJob[];
  onStatus: (jobId: string, status: ApplicationStatus) => void;
  onNotes: (jobId: string, notes: string) => void;
  onRemove: (jobId: string) => void;
  onGoSearch: () => void;
}

export function SavedJobsBoard({ items, onStatus, onNotes, onRemove, onGoSearch }: Props) {
  const [filter, setFilter] = useState<ApplicationStatus | "All">("All");
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])) as Record<ApplicationStatus, number>;
  const visible = (filter === "All" ? items : items.filter((i) => i.status === filter)).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function exportCsv() {
    const blob = new Blob([savedJobsToCsv(items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `career-match-hub-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-14">
        <h2 className="font-display text-xl font-semibold">No saved jobs yet</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">Save a job from your search results to track it here, change its status and keep notes.</p>
        <button type="button" className={`${secondaryButton} mt-4`} onClick={onGoSearch}>
          Go to job search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {(["All", ...APPLICATION_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === s ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-muted hover:text-ink"}`}
            >
              {s} <span className="tabular-nums opacity-80">{s === "All" ? items.length : counts[s]}</span>
            </button>
          ))}
        </div>
        <button type="button" className={secondaryButton} onClick={exportCsv}>
          <Download className="size-4" aria-hidden /> Export CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-10 text-sm text-muted">Nothing is marked {filter} yet.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {visible.map(({ job, status, notes }) => {
            const apply = safeUrl(job.applyUrl);
            return (
              <li key={job.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold leading-snug">{job.title}</h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {job.company} · {job.location}
                    </p>
                  </div>
                  {job.match && <ScoreBadge score={job.match.score} source={job.match.source} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{job.workMode}</Badge>
                  <Badge>{job.employmentType}</Badge>
                  <span className="text-sm text-muted">{formatSalary(job.salary)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={`s-${job.id}`} className="text-sm font-medium">
                    Status
                  </label>
                  <select id={`s-${job.id}`} value={status} onChange={(e) => onStatus(job.id, e.target.value as ApplicationStatus)} className={`${inputClass} w-auto py-1.5`}>
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`n-${job.id}`} className="text-sm font-medium">
                    Notes
                  </label>
                  <textarea
                    id={`n-${job.id}`}
                    value={notes}
                    onChange={(e) => onNotes(job.id, e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Contacts, interview dates, follow-ups"
                    className={`${inputClass} mt-1.5 resize-y`}
                  />
                </div>

                <div className="mt-auto flex items-center justify-between pt-1">
                  {apply ? (
                    <a href={apply} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                      Open posting <ExternalLink className="size-4" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="text-sm text-muted">{job.source === "demo" ? "Sample listing" : "No link"}</span>
                  )}
                  <button type="button" onClick={() => onRemove(job.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-danger-bg hover:text-danger">
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
