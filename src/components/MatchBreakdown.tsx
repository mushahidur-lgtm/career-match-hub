import { Quote } from "lucide-react";
import type { Confidence, Job, MatchResult } from "@/types/job";
import { Corrections, Points, ScoreSummary } from "./match-v2";
import { Badge } from "./ui";

const confidenceTone: Record<Confidence, "good" | "info" | "warn"> = { high: "good", medium: "info", low: "warn" };
const statusLabel = {
  seniority: { aligned: "Level fits", stretch: "A stretch", overqualified: "Below your level", unknown: "Level unclear" },
  location: { yes: "Fits", partial: "Partly fits", no: "Outside your cities", unknown: "Unclear" },
  salary: { meets: "Meets your minimum", below: "Below your minimum", unknown: "Salary unknown" },
} as const;

function Group({ title, items, tone, empty }: { title: string; items: string[]; tone: "good" | "warn" | "neutral" | "info"; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((s) => (
            <li key={s}>
              <Badge tone={tone}>{s}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

export function MatchBreakdown({ match, job }: { match: MatchResult; job?: Job }) {
  const d = match.detail;
  if (!d) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={confidenceTone[d.confidence]}>Confidence: {d.confidence}</Badge>
          <Badge tone="neutral">{match.source === "ai" ? "Reviewed by Claude" : "Rule-based score"}</Badge>
        </div>
        <p className="max-w-prose text-sm leading-relaxed">{d.explanation}</p>
        {d.aiNote && <p className="max-w-prose text-sm leading-relaxed text-muted">Claude: {d.aiNote}</p>}
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-medium text-ink">Why this confidence</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {d.confidenceReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </div>

      <ScoreSummary match={match} />
      <Points title="Strengths" points={d.strengths ?? []} />
      <Points title="Gaps" points={d.gaps ?? []} />

      <section aria-label="How the score is built">
        <h3 className="font-display text-base font-semibold">How the score is built</h3>
        <ul className="mt-3 space-y-3">
          {d.components.map((c) => (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  {c.label}
                  {c.aiAdjusted && <span className="ml-2 text-xs font-normal text-muted">adjusted by Claude</span>}
                </span>
                <span className="tabular-nums text-muted">{c.score === null ? "Not judged" : `${c.score}/100 · counts ${c.weight}%`}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={c.score === null ? `${c.label}: not judged` : `${c.label}: ${c.score} out of 100`}>
                {c.score !== null && <div className="h-full rounded-full bg-brand" style={{ width: `${c.score}%` }} />}
              </div>
              <p className="mt-1 text-xs text-muted">{c.note}</p>
            </li>
          ))}
        </ul>
        {d.caps.map((c) => (
          <p key={c} className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
            {c}
          </p>
        ))}
      </section>

      <section aria-label="Skills" className="space-y-4">
        <h3 className="font-display text-base font-semibold">Skills</h3>
        <Group title="Required skills you have" items={d.requiredMatched} tone="good" empty="None of the required skills named in this posting is on your profile." />
        <Group title="Required skills you lack" items={d.requiredMissing} tone="warn" />
        {d.transferable.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold">Related skills</h4>
            <p className="text-xs text-muted">Not the same tool, but real overlap with something you have.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.transferable.map((t) => (
                <li key={t.skill}>
                  <span title={t.why}>
                    <Badge tone="info">
                      {t.skill} (you have {t.via})
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Group title="Preferred skills you have" items={d.preferredMatched} tone="good" />
        <Group title="Preferred skills you lack" items={d.preferredMissing} tone="neutral" />
      </section>

      <section aria-label="Fit" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { title: "Seniority", label: statusLabel.seniority[d.seniority.status], note: d.seniority.note },
          { title: "Location", label: statusLabel.location[d.location.status], note: d.location.note },
          { title: "Salary", label: statusLabel.salary[d.salary.status], note: d.salary.note },
        ].map((x) => (
          <div key={x.title} className="rounded-lg border border-line p-3">
            <h4 className="text-xs font-medium text-muted">{x.title}</h4>
            <p className="mt-0.5 text-sm font-semibold">{x.label}</p>
            <p className="mt-1 text-xs text-muted">{x.note}</p>
          </div>
        ))}
      </section>

      {d.evidence.length > 0 && (
        <section aria-label="Resume evidence">
          <h3 className="font-display text-base font-semibold">From your resume</h3>
          <p className="text-xs text-muted">Lines copied from your resume that support this match.</p>
          <ul className="mt-2 space-y-2">
            {d.evidence.map((e) => (
              <li key={e} className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <Quote className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!d.gaps && d.experienceGaps.length > 0 && (
        <section aria-label="Gaps">
          <h3 className="font-display text-base font-semibold">Gaps to be ready for</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {d.experienceGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {job && <Corrections job={job} />}
    </div>
  );
}
