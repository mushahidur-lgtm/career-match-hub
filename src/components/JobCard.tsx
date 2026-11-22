"use client";

import { useState } from "react";
import { Building2, ExternalLink, MapPin, UsersRound, Wallet } from "lucide-react";
import { formatSalary } from "@/lib/format";
import type { Job, SavedJob } from "@/types/job";
import { useContacts } from "./contacts/context";
import { JobDetailDialog, type DetailTab } from "./JobDetailDialog";
import { ConfidenceBadge, FreshnessBadge, JobQualityLine, SaveControl, modeTone, safeUrl, typeLabel, typeTone, type JobActions } from "./job-parts";
import { Badge, ScoreBadge, secondaryButton } from "./ui";

interface Props extends JobActions {
  job: Job;
  saved: SavedJob | undefined;
}

export function JobCard({ job, saved, onSave, onStatus, onRemove }: Props) {
  const [open, setOpen] = useState<DetailTab | null>(null);
  const contacts = useContacts();
  const titleId = `job-${job.id}-card`;
  const apply = safeUrl(job.applyUrl);

  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={titleId} className="font-display text-lg font-semibold leading-snug">
            {job.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4" aria-hidden />
              {job.company}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden />
              {job.location}
            </span>
          </p>
        </div>
        {job.match && <ScoreBadge score={job.match.score} source={job.match.source} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={modeTone[job.workMode]}>{job.workMode}</Badge>
        <Badge tone={typeTone[job.employmentType]}>{typeLabel(job.employmentType)}</Badge>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Wallet className="size-4 text-muted" aria-hidden />
          <span className={job.salary ? "font-medium" : "text-muted"}>{formatSalary(job.salary)}</span>
        </span>
        <FreshnessBadge postedAt={job.postedAt} />
        {job.match?.detail && <ConfidenceBadge confidence={job.match.detail.confidence} />}
        {saved && <Badge tone="brand">{saved.status}</Badge>}
      </div>

      {job.match && <p className="mt-3 line-clamp-3 max-w-prose text-sm text-muted">{job.match.matchReason}</p>}

      <JobQualityLine job={job} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => setOpen("overview")} aria-haspopup="dialog">
          Details
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen("match")} aria-haspopup="dialog">
          Match analysis
        </button>
        <button type="button" className={secondaryButton} onClick={() => contacts.openFinder(job)} aria-haspopup="dialog">
          <UsersRound className="size-4" aria-hidden /> Find recruiter
        </button>
        {apply && (
          <a href={apply} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            Apply <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <SaveControl job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
      </div>

      {open && <JobDetailDialog job={job} saved={saved} initialTab={open} onSave={onSave} onStatus={onStatus} onRemove={onRemove} onClose={() => setOpen(null)} />}
    </article>
  );
}
