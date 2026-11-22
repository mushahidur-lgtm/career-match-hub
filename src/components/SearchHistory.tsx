"use client";

import { RotateCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { IntelStore, SearchFilters, SearchRecord } from "@/types/job";
import type { Tab } from "./AppShell";
import { primaryButton, secondaryButton } from "./ui";

interface Props {
  intel: IntelStore;
  onRun: (filters: SearchFilters) => void;
  onRemove: (id: string) => void;
  onClearSearches: () => void;
  onForgetAll: () => void;
  onGo: (tab: Tab) => void;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function filterSummary(f: SearchFilters): string {
  const parts = [f.category !== "All" ? f.category : null, f.workMode !== "All" ? f.workMode : null, f.employmentType !== "All" ? f.employmentType : null, f.minSalary ? `at least $${Math.round(f.minSalary / 1000)}k` : null];
  return parts.filter(Boolean).join(", ") || "No other filters";
}

const providerName = (p: SearchRecord["provider"]) => (p === "adzuna" ? "Adzuna" : p === "jsearch" ? "JSearch" : p === "demo" ? "Demo data" : "None");

export function SearchHistory({ intel, onRun, onRemove, onClearSearches, onForgetAll, onGo }: Props) {
  const [confirm, setConfirm] = useState<"list" | "all" | null>(null);
  const { history, seen } = intel;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Search history</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Every search you run is kept in this browser, with a compact note of each job it returned (no descriptions). This is what Career intelligence is counted from. Up to 200 searches and 1,200 jobs are kept; the oldest go first.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12">
          <h2 className="font-display text-lg font-semibold">No searches yet</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">Searches made with no job source connected are not kept, since they find nothing.</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => onGo("discover")}>
            Discover jobs
          </button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {h.filters.query || "All roles"} <span className="font-normal text-muted">in {h.filters.location}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {when(h.at)} · {providerName(h.provider)}
                    {h.resumeName ? ` · matched with ${h.resumeName}` : " · no resume"}
                  </p>
                  <p className="mt-1 text-sm">
                    {h.resultCount} {h.resultCount === 1 ? "job" : "jobs"}, {h.newCount} new to you
                    {h.avgScore !== null ? `, average match ${h.avgScore}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{filterSummary(h.filters)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className={secondaryButton} onClick={() => onRun(h.filters)}>
                    <RotateCw className="size-4" aria-hidden /> Run again
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => onRemove(h.id)} aria-label={`Delete the search for ${h.filters.query || "all roles"} on ${when(h.at)}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
            <h2 className="font-display text-base font-semibold">Clear</h2>
            <p className="text-muted">
              Deleting a search removes it from this list only; the jobs it found stay in your charts. Forgetting everything also empties the {seen.length} {seen.length === 1 ? "job" : "jobs"} the charts are counted from, and cannot be undone. Your applications are never touched.
            </p>
            {confirm === null ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setConfirm("list")}>
                  Clear the search list
                </button>
                <button type="button" className={secondaryButton} onClick={() => setConfirm("all")}>
                  Forget searches and jobs seen
                </button>
              </div>
            ) : (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{confirm === "list" ? `Clear ${history.length} searches?` : `Forget ${history.length} searches and ${seen.length} jobs? This cannot be undone.`}</span>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => {
                    if (confirm === "list") onClearSearches();
                    else onForgetAll();
                    setConfirm(null);
                  }}
                >
                  Yes, clear
                </button>
                <button type="button" className={secondaryButton} onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
