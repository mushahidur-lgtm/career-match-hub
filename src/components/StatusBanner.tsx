import { Cpu, Database, FlaskConical, Sparkles } from "lucide-react";
import type { AppStatus, StoredResults } from "@/types/job";

const PROVIDER_NAME = { adzuna: "Adzuna", jsearch: "JSearch", demo: "Demo" } as const;

interface Props {
  status: AppStatus | null;
  results: StoredResults | null;
}

export function StatusBanner({ status, results }: Props) {
  // After a search, report what actually happened (a live search can fall back to demo).
  const demo = results ? results.mode === "demo" : status ? status.jobProvider === "demo" : null;
  const provider = results ? results.provider : status?.jobProvider;

  return (
    <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
      {demo === null ? (
        <span className="rounded-lg border border-line bg-surface px-3 py-1.5 text-muted">Checking configuration</span>
      ) : demo ? (
        <span className="inline-flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-1.5 font-medium text-warn">
          <FlaskConical className="size-4" aria-hidden />
          <span>
            Demo Mode: sample jobs, not real postings
            <span className="hidden font-normal sm:inline">. Add Adzuna or RapidAPI keys for live listings.</span>
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-lg bg-good-bg px-3 py-1.5 font-medium text-good">
          <Database className="size-4" aria-hidden />
          Live jobs from {provider ? PROVIDER_NAME[provider] : "a provider"}
        </span>
      )}
      {status &&
        (status.ai ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-info-bg px-3 py-1.5 font-medium text-info">
            <Sparkles className="size-4" aria-hidden />
            Claude analysis on
            {status.model && <span className="hidden font-normal sm:inline">({status.model})</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-muted">
            <Cpu className="size-4" aria-hidden />
            Keyword analysis. Add ANTHROPIC_API_KEY for Claude.
          </span>
        ))}
    </div>
  );
}
