"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { freshness, type FreshnessLevel } from "@/lib/job-meta";
import { applyLinkInfo, descriptionInfo, likelyClosed } from "@/lib/job-quality";
import { APPLICATION_STATUSES, type ApplicationStatus, type Confidence, type Job, type SavedJob } from "@/types/job";
import { Badge, inputClass, primaryButton } from "./ui";

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

export const modeTone = { Remote: "info", Hybrid: "brand", "On-site": "neutral", "Not stated": "neutral" } as const;
export const typeTone = { "Full-time": "good", Contract: "warn", "Part-time": "neutral", Internship: "neutral", "Not stated": "neutral" } as const;
export const typeLabel = (t: Job["employmentType"]) => (t === "Not stated" ? "Type not stated" : t);

export interface JobActions {
  onSave: (job: Job, status: ApplicationStatus) => void;
  onStatus: (jobId: string, status: ApplicationStatus) => void;
  onRemove: (jobId: string) => void;
}

const freshTone: Record<FreshnessLevel, "good" | "info" | "neutral" | "warn"> = { new: "good", recent: "info", aging: "neutral", stale: "warn", unknown: "neutral" };

export function FreshnessBadge({ postedAt }: { postedAt: string | null }) {
  const f = freshness(postedAt);
  return <Badge tone={freshTone[f.level]}>{f.level === "stale" ? `${f.label}. May be closed` : f.label}</Badge>;
}

export const SOURCE_NAME = { adzuna: "Adzuna", jsearch: "JSearch", demo: "sample data", manual: "you" } as const;

/** One line that says where a listing came from, how old it is, and how much of it we have. Warnings are badges so they are not missed. */
export function JobQualityLine({ job }: { job: Job }) {
  const d = descriptionInfo(job);
  const link = applyLinkInfo(job);
  const closed = likelyClosed(job);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{job.source === "manual" ? "Added by you" : `via ${SOURCE_NAME[job.source]}`}</span>
      {job.duplicateCount ? <span>· also listed {job.duplicateCount} more {job.duplicateCount === 1 ? "time" : "times"}</span> : null}
      {d.level === "full" ? <span>· Full description</span> : <Badge tone="warn">{d.label}</Badge>}
      {link.kind === "none" ? <Badge tone="warn">No apply link</Badge> : link.direct ? <span>· Link: employer</span> : <Badge tone="neutral">Link: {link.kind === "redirect" ? "via Adzuna" : link.kind === "job-board" ? "job board" : "unverified site"}</Badge>}
      {closed.closed && <Badge tone="warn">Likely closed</Badge>}
    </div>
  );
}

/** The same facts with their explanations, and a clearly labelled link to read the full posting on its own site. */
export function JobQualityPanel({ job }: { job: Job }) {
  const d = descriptionInfo(job);
  const link = applyLinkInfo(job);
  const closed = likelyClosed(job);
  const href = safeUrl(job.applyUrl);
  return (
    <section aria-label="Listing quality" className="space-y-2 rounded-lg border border-line p-3 text-sm">
      <h3 className="text-xs font-medium text-muted">Listing quality</h3>
      <ul className="space-y-1.5">
        <li>
          <span className="font-medium">{d.label}.</span> <span className="text-muted">{d.chars.toLocaleString()} characters{d.note ? `. ${d.note}` : "."}</span>
        </li>
        <li>
          <span className="font-medium">{link.label}.</span> {link.note && <span className="text-muted">{link.note}</span>}
        </li>
        <li>
          <span className="font-medium">{closed.closed ? "May be closed." : "No sign it has closed."}</span>{" "}
          <span className="text-muted">{closed.closed ? `${closed.reasons.join(". ")}. Confirm on the employer's site before applying.` : "Job boards do not say when a posting closes, so this only checks age and the posting's own text."}</span>
        </li>
      </ul>
      {href && d.level !== "full" && (
        <p>
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
            Open the posting on {link.host ?? "its site"} to read it in full
          </a>
          <span className="text-muted"> (an outside site, opens in a new tab; this app does not read it)</span>
        </p>
      )}
    </section>
  );
}

const confTone: Record<Confidence, "good" | "info" | "warn"> = { high: "good", medium: "info", low: "warn" };
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <Badge tone={confTone[confidence]}>{confidence[0].toUpperCase() + confidence.slice(1)} confidence</Badge>;
}

export function SaveControl({ job, saved, onSave, onStatus, onRemove }: { job: Job; saved: SavedJob | undefined } & JobActions) {
  if (!saved) {
    return (
      <button type="button" className={primaryButton} onClick={() => onSave(job, "Interested")}>
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
      <select id={`status-${job.id}`} value={saved.status} onChange={(e) => onStatus(saved.job.id, e.target.value as ApplicationStatus)} className={`${inputClass} w-auto py-1.5`}>
        {APPLICATION_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => onRemove(saved.job.id)}>
        Remove
      </button>
    </div>
  );
}
