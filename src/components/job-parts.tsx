"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { freshness, type FreshnessLevel } from "@/lib/job-meta";
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

const confTone: Record<Confidence, "good" | "info" | "warn"> = { high: "good", medium: "info", low: "warn" };
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <Badge tone={confTone[confidence]}>{confidence[0].toUpperCase() + confidence.slice(1)} confidence</Badge>;
}

export function SaveControl({ job, saved, onSave, onStatus, onRemove }: { job: Job; saved: SavedJob | undefined } & JobActions) {
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
