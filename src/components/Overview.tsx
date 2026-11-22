"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { formatPosted, formatSalary } from "@/lib/format";
import type { AttentionItem, Opportunity, OverviewStats } from "@/lib/overview";
import type { Job, ProviderStatus } from "@/types/job";
import type { Tab } from "./AppShell";
import { Badge, ScoreBadge, primaryButton, secondaryButton } from "./ui";

interface Props {
  stats: OverviewStats;
  resumeName: string | null;
  provider: ProviderStatus | undefined;
  hasSearched: boolean;
  onOpenJob: (job: Job) => void;
  onGo: (tab: Tab) => void;
}

export function Overview({ stats, resumeName, provider, hasSearched, onOpenJob, onGo }: Props) {
  const sourceConnected = provider === "adzuna" || provider === "jsearch";
  const sampleOnly = provider === "demo";
  const started = Boolean(resumeName) && hasSearched;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          {resumeName ? `Matching with ${resumeName}.` : "Add a resume to start matching."} Numbers come from your latest search and the jobs you track.
        </p>
      </div>

      {!started && <GetStarted hasResume={Boolean(resumeName)} sourceConnected={sourceConnected} sampleOnly={sampleOnly} hasSearched={hasSearched} onGo={onGo} />}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Active opportunities" value={stats.activeOpportunities} />
        <Kpi label="Excellent matches (90+)" value={stats.excellent} tone="good" />
        <Kpi label="Strong matches (70 to 89)" value={stats.strong} tone="info" />
        <Kpi label="Applications sent" value={stats.applicationsSent} />
        <Kpi label="In interviews" value={stats.interviews} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Best matching opportunities" empty="Run a search to see your best matches." items={stats.best} onOpenJob={onOpenJob} action={{ label: "Open Discover", onClick: () => onGo("discover") }}>
          {(o) => <ScoreCell o={o} />}
        </Panel>

        <Panel title="Newly discovered" empty="No jobs in your latest search were posted in the last 7 days." items={stats.newlyDiscovered} onOpenJob={onOpenJob}>
          {(o) => <span className="text-xs text-muted">{formatPosted(o.job.postedAt)}</span>}
        </Panel>

        <Panel title="Highest salary" empty="No job in your results states a salary yet. Estimated salaries are left out." items={stats.highestSalary} onOpenJob={onOpenJob} stack>
          {(o) => <span className="text-sm font-semibold">{formatSalary(o.job.salary)}</span>}
        </Panel>

        <section aria-labelledby="attention-heading" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="attention-heading" className="font-display text-base font-semibold">
            Applications needing attention
          </h2>
          {stats.attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing is waiting on you. Items appear here when an application goes quiet, an offer arrives, or an excellent match sits unapplied.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {stats.attention.map((a) => (
                <AttentionRow key={a.job.id} item={a} onOpenJob={onOpenJob} />
              ))}
            </ul>
          )}
          <button type="button" className={`${secondaryButton} mt-4`} onClick={() => onGo("applications")}>
            Open My applications <ArrowRight className="size-4" aria-hidden />
          </button>
        </section>
      </div>

      <section aria-labelledby="skills-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="skills-heading" className="font-display text-base font-semibold">
          Trending skills
        </h2>
        {stats.trendingSkills.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Skill counts appear after a search with a resume, based on the skills the postings name.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Counted from the {stats.skillSampleSize} jobs in your results and tracker that were analysed. This is observed data, not a market-wide figure.</p>
            <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {stats.trendingSkills.map((s) => (
                <li key={s.skill}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{s.skill}</span>
                    <span className="tabular-nums text-muted">
                      {s.count} of {stats.skillSampleSize}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${s.skill}: ${s.count} of ${stats.skillSampleSize} jobs`}>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(s.count / Math.max(1, stats.skillSampleSize)) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "good" | "info" }) {
  const color = tone === "good" ? "text-good" : tone === "info" ? "text-info" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ScoreCell({ o }: { o: Opportunity }) {
  return o.job.match ? <ScoreBadge score={o.job.match.score} source={o.job.match.source} /> : null;
}

function Panel({
  title,
  empty,
  items,
  onOpenJob,
  action,
  stack = false,
  children,
}: {
  title: string;
  empty: string;
  items: Opportunity[];
  onOpenJob: (job: Job) => void;
  action?: { label: string; onClick: () => void };
  /** Put the extra value under the title instead of beside it, for long values. */
  stack?: boolean;
  children: (o: Opportunity) => ReactNode;
}) {
  const id = `panel-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5">
      <h2 id={id} className="font-display text-base font-semibold">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((o) => (
            <li key={o.job.id} className={stack ? "py-3" : "flex items-center justify-between gap-3 py-3"}>
              <button type="button" onClick={() => onOpenJob(o.job)} className={`min-w-0 text-left ${stack ? "block w-full" : "flex-1"}`} aria-label={`Open ${o.job.title} at ${o.job.company}`}>
                <span className="block truncate text-sm font-semibold hover:underline">{o.job.title}</span>
                <span className="block truncate text-xs text-muted">
                  {o.job.company} · {o.job.location}
                </span>
                {o.status && (
                  <span className="mt-1 inline-block">
                    <Badge>{o.status}</Badge>
                  </span>
                )}
              </button>
              {stack ? <div className="mt-1">{children(o)}</div> : children(o)}
            </li>
          ))}
        </ul>
      )}
      {action && items.length > 0 && (
        <button type="button" className={`${secondaryButton} mt-4`} onClick={action.onClick}>
          {action.label} <ArrowRight className="size-4" aria-hidden />
        </button>
      )}
    </section>
  );
}

function AttentionRow({ item, onOpenJob }: { item: AttentionItem; onOpenJob: (job: Job) => void }) {
  return (
    <li className="py-3">
      <button type="button" onClick={() => onOpenJob(item.job)} className="w-full text-left" aria-label={`Open ${item.job.title} at ${item.job.company}`}>
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-semibold hover:underline">
            {item.job.title} <span className="font-normal text-muted">· {item.job.company}</span>
          </span>
          {item.status && <Badge tone={item.status === "Offer" ? "good" : "warn"}>{item.status}</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{item.reason}</span>
      </button>
    </li>
  );
}

function GetStarted({ hasResume, sourceConnected, sampleOnly, hasSearched, onGo }: { hasResume: boolean; sourceConnected: boolean; sampleOnly: boolean; hasSearched: boolean; onGo: (tab: Tab) => void }) {
  const steps: { done: boolean; title: string; text: string; cta: string; tab: Tab }[] = [
    { done: hasResume, title: "Add your resume", text: "We read your skills, experience, education and certifications. You can correct anything.", cta: "Add a resume", tab: "profile" },
    { done: false, title: "Check your search preferences", text: "Permanent full-time, CAD $100,000 and up, and your cities are set by default. Change them any time.", cta: "Review preferences", tab: "settings" },
    { done: sourceConnected, title: "Connect a job source", text: sourceConnected
        ? "A job board is connected."
        : sampleOnly
          ? "Development only: this shows invented sample jobs. Add an Adzuna or RapidAPI key to search real postings."
          : "Real postings need an Adzuna or RapidAPI key in the deployment settings. This site does not invent listings.", cta: "See how", tab: "settings" },
    { done: hasSearched, title: "Run your first search", text: "Pick a recommended title and search. Each job is scored against your resume.", cta: "Open Discover", tab: "discover" },
  ];
  return (
    <section aria-labelledby="start-heading" className="rounded-xl border border-line bg-surface p-5">
      <h2 id="start-heading" className="font-display text-base font-semibold">
        Get started
      </h2>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            {s.done ? <Check className="mt-0.5 size-5 shrink-0 text-good" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted" aria-label="Not done" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="mt-0.5 max-w-prose text-sm text-muted">{s.text}</p>
              {!s.done && (
                <button type="button" className={`${i === 0 || (hasResume && !hasSearched && i === 3) ? primaryButton : secondaryButton} mt-2`} onClick={() => onGo(s.tab)}>
                  {s.cta}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
