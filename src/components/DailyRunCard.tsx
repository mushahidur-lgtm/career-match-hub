"use client";

import { ExternalLink, Sunrise } from "lucide-react";
import type { LatestRun } from "@/lib/cloud/use-cloud";
import { safeUrl } from "./job-parts";
import { Badge } from "./ui";

const money = (n: number) => `$${Math.round(n / 1000)}k`;

/** What this morning's automatic search found. Shown only when a run exists for you. */
export function DailyRunCard({ run }: { run: LatestRun }) {
  const p = run.payload;
  const ran = new Date(run.ranAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <section aria-labelledby="daily-heading" className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="daily-heading" className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sunrise className="size-5 text-brand" aria-hidden /> Morning run
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {ran}. {p.searches.length} {p.searches.length === 1 ? "search" : "searches"} of your primary roles found {p.observations.length} {p.observations.length === 1 ? "job" : "jobs"}
            {run.newJobs > 0 ? `, ${run.newJobs} new to you` : ""}.{p.skipped > 0 ? ` ${p.skipped} planned ${p.skipped === 1 ? "search was" : "searches were"} skipped (a job source did not answer or time ran out).` : ""}
          </p>
        </div>
        <Badge tone="neutral">{p.resumeName ? `Scored with ${p.resumeName}` : "Not scored"}</Badge>
      </div>
      {p.top.length > 0 ? (
        <>
          <p className="text-xs text-muted">Best matches by the rule-based score, which is an estimate. Claude is not used in the morning run.</p>
          <ul className="divide-y divide-line">
            {p.top.slice(0, 5).map((j, i) => {
              const href = safeUrl(j.applyUrl);
              return (
                <li key={`${j.title}-${j.company}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{j.title}</p>
                    <p className="truncate text-xs text-muted">
                      {j.company} · {j.location}
                      {j.pay ? ` · ${money(j.pay.lo)} to ${money(j.pay.hi)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {j.score !== null && <span className="font-semibold tabular-nums">{j.score}</span>}
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline-offset-2 hover:underline">
                        Apply <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">{p.resumeName ? "No job scored high enough to list." : "Add a resume and turn on sync so the morning run can score jobs for you."}</p>
      )}
    </section>
  );
}
