"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Building2, Check, ExternalLink, MapPin, Wallet, X } from "lucide-react";
import { formatPosted, formatSalary } from "@/lib/format";
import { APPLICATION_STATUSES, type ApplicationStatus, type Job, type SavedJob } from "@/types/job";
import { MatchBreakdown } from "./MatchBreakdown";
import { Badge, ScoreBadge, inputClass, primaryButton, secondaryButton } from "./ui";

interface Props {
  job: Job;
  saved: SavedJob | undefined;
  onSave: (job: Job, status: ApplicationStatus) => void;
  onStatus: (jobId: string, status: ApplicationStatus) => void;
  onRemove: (jobId: string) => void;
}

/** Only web links are allowed, so a provider can never hand us a javascript: URL. */
export function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

const modeTone = { Remote: "info", Hybrid: "brand", "On-site": "neutral", "Not stated": "neutral" } as const;
const typeTone = { "Full-time": "good", Contract: "warn", "Part-time": "neutral", Internship: "neutral", "Not stated": "neutral" } as const;

export function JobCard({ job, saved, onSave, onStatus, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = `job-${job.id}-title`;

  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby={`${titleId}-card`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`${titleId}-card`} className="font-display text-lg font-semibold leading-snug">
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
        <Badge tone={typeTone[job.employmentType]}>{job.employmentType === "Not stated" ? "Type not stated" : job.employmentType}</Badge>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Wallet className="size-4 text-muted" aria-hidden />
          <span className={job.salary ? "font-medium" : "text-muted"}>{formatSalary(job.salary)}</span>
        </span>
        <span className="text-sm text-muted">{formatPosted(job.postedAt)}</span>
      </div>

      {job.match && <p className="mt-3 line-clamp-3 max-w-prose text-sm text-muted">{job.match.matchReason}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => setOpen(true)} aria-haspopup="dialog">
          Match analysis
        </button>
        <SaveControl job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
      </div>

      {open && <JobDetailDialog job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} onClose={() => setOpen(false)} />}
    </article>
  );
}

/** The full match analysis for one job. Used from the results list and from the Overview. */
export function JobDetailDialog({ job, saved, onSave, onStatus, onRemove, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `job-${job.id}-title`;

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-[min(46rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <JobDetail job={job} titleId={titleId} onClose={() => dialog.current?.close()}>
        <SaveControl job={job} saved={saved} onSave={onSave} onStatus={onStatus} onRemove={onRemove} />
      </JobDetail>
    </dialog>
  );
}

function SaveControl({ job, saved, onSave, onStatus, onRemove }: Omit<Props, never>) {
  if (!saved) {
    return (
      <button type="button" className={primaryButton} onClick={() => onSave(job, "Saved")}>
        <Bookmark className="size-4" aria-hidden /> Save job
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
        <BookmarkCheck className="size-4" aria-hidden /> Tracking
      </span>
      <label className="sr-only" htmlFor={`status-${job.id}`}>
        Application status for {job.title}
      </label>
      <select
        id={`status-${job.id}`}
        value={saved.status}
        onChange={(e) => onStatus(job.id, e.target.value as ApplicationStatus)}
        className={`${inputClass} w-auto py-1.5`}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => onRemove(job.id)}>
        Remove
      </button>
    </div>
  );
}

function JobDetail({ job, titleId, onClose, children }: { job: Job; titleId: string; onClose: () => void; children: React.ReactNode }) {
  const apply = safeUrl(job.applyUrl);
  const m = job.match;

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface p-5">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-xl font-semibold leading-snug">
            {job.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {job.company} · {job.location}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {m && <ScoreBadge score={m.score} source={m.source} large />}
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="space-y-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={modeTone[job.workMode]}>{job.workMode}</Badge>
          <Badge tone={typeTone[job.employmentType]}>{job.employmentType === "Not stated" ? "Type not stated" : job.employmentType}</Badge>
          <Badge>{job.category}</Badge>
          <span className="text-sm font-medium">{formatSalary(job.salary)}</span>
          <span className="text-sm text-muted">{formatPosted(job.postedAt)}</span>
        </div>

        {m && m.detail ? (
          <section aria-label="Match analysis">
            <MatchBreakdown match={m} />
          </section>
        ) : m ? (
          <section aria-label="Match analysis" className="space-y-4">
            <p className="max-w-prose text-sm leading-relaxed">{m.matchReason}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SkillList title="Skills you have" empty="No overlap with the skills named in this posting." skills={m.matchingSkills} tone="good" />
              <SkillList title="Skill gaps" empty="No gaps found in the skills this posting names." skills={m.missingSkills} tone="warn" />
            </div>
            <p className="text-xs text-muted">{m.source === "ai" ? "Scored by Claude from your skills and this posting." : "Scored by the keyword engine. Add an Anthropic key for Claude scoring."}</p>
          </section>
        ) : (
          <p className="text-sm text-muted">Add a resume to see how well this job matches.</p>
        )}

        <section aria-label="Job description">
          <h3 className="font-display text-base font-semibold">Description</h3>
          <div className="mt-2 max-w-prose whitespace-pre-line text-sm leading-relaxed">{job.description || "No description was provided."}</div>
          {job.descriptionTruncated && <p className="mt-3 text-xs text-muted">The job board shares only the start of this posting. Open the full posting to read the rest.</p>}
        </section>
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4">
        {children}
        {apply ? (
          <a href={apply} target="_blank" rel="noopener noreferrer" className={primaryButton}>
            Apply <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Check className="size-4" aria-hidden />
            {job.source === "demo" ? "Sample listing, no apply link" : "No apply link provided"}
          </span>
        )}
      </footer>
    </div>
  );
}

function SkillList({ title, skills, empty, tone }: { title: string; skills: string[]; empty: string; tone: "good" | "warn" }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {skills.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <li key={s}>
              <Badge tone={tone}>{s}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}
