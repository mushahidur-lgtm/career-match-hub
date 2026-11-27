import { Cpu, Database, FlaskConical, Lock, Sparkles } from "lucide-react";
import type { AppStatus, StoredResults } from "@/types/job";

const PROVIDER_NAME = { adzuna: "Adzuna", jsearch: "JSearch", demo: "Demo", none: "no provider" } as const;

interface Props {
  status: AppStatus | null;
  results: StoredResults | null;
  /** Why private features are unavailable, for example that nobody is signed in. */
  locked?: string | null;
}

export function StatusBanner({ status, results, locked }: Props) {
  if (locked) {
    return (
      <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
        <span className="inline-flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-1.5 font-medium text-warn">
          <Lock className="size-4" aria-hidden />
          {locked}
        </span>
      </div>
    );
  }

  // After a search, report what actually happened (a live search can fail).
  const provider = results ? results.provider : status?.jobProvider;
  const kind = provider === undefined ? null : provider === "demo" ? "demo" : provider === "none" ? "none" : "live";

  return (
    <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
      {kind === null ? (
        <span className="rounded-lg border border-line bg-surface px-3 py-1.5 text-muted">Checking configuration</span>
      ) : kind === "none" ? (
        <span className="inline-flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-1.5 font-medium text-warn">
          <Database className="size-4" aria-hidden />
          <span>
            No job source connected
            <span className="hidden font-normal sm:inline">. Add Adzuna or RapidAPI keys to search real postings.</span>
          </span>
        </span>
      ) : kind === "demo" ? (
        <span className="inline-flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-1.5 font-medium text-warn">
          <FlaskConical className="size-4" aria-hidden />
          <span>
            Demo Mode (development only): invented sample jobs
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
