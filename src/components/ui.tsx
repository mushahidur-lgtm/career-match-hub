import type { ReactNode } from "react";
import { scoreTone, type ScoreTone } from "@/lib/format";

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-2";

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

const tones: Record<ScoreTone, string> = {
  good: "bg-good-bg text-good",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
};

export function ScoreBadge({ score, source, large = false }: { score: number; source?: "ai" | "heuristic"; large?: boolean }) {
  const label = scoreTone(score) === "good" ? "Excellent match" : scoreTone(score) === "info" ? "Strong match" : "Partial match";
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1 leading-none ${tones[scoreTone(score)]} ${large ? "min-w-20 py-2" : "min-w-14"}`}
      title={source === "ai" ? "Scored by Claude" : "Scored by the keyword engine"}
    >
      <span className={`font-display font-bold tabular-nums ${large ? "text-3xl" : "text-xl"}`}>{score}</span>
      <span className="mt-1 text-[11px] font-medium">{large ? label : "match"}</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "info" | "warn" | "brand" }) {
  const map = {
    neutral: "bg-surface-2 text-muted border border-line",
    good: "bg-good-bg text-good",
    info: "bg-info-bg text-info",
    warn: "bg-warn-bg text-warn",
    brand: "bg-brand text-on-brand",
  } as const;
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Notice({ tone, children }: { tone: "error" | "warn" | "info"; children: ReactNode }) {
  const map = {
    error: "bg-danger-bg text-danger",
    warn: "bg-warn-bg text-warn",
    info: "bg-info-bg text-info",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${map[tone]}`}>
      {children}
    </div>
  );
}
