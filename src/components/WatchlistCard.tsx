"use client";

import { Eye } from "lucide-react";
import { useMemo } from "react";
import { watchReminders } from "@/lib/watchlist/model";
import type { WatchlistStore } from "@/types/watchlist";
import { Badge } from "./ui";

/** Career sites due for a check. Shown on the Overview only when something is due. */
export function WatchlistCard({ store, onGo }: { store: WatchlistStore; onGo: () => void }) {
  const due = useMemo(() => watchReminders(store.sites), [store.sites]);
  if (due.length === 0) return null;
  return (
    <section aria-labelledby="watch-heading" className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="watch-heading" className="flex items-center gap-2 font-display text-lg font-semibold">
          <Eye className="size-5 text-brand" aria-hidden /> Career sites to check
        </h2>
        <button type="button" className="text-sm font-semibold text-brand underline-offset-2 hover:underline" onClick={onGo}>
          Open the watchlist
        </button>
      </div>
      <ul className="divide-y divide-line">
        {due.slice(0, 5).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <Badge tone={r.overdue ? "warn" : "neutral"}>{r.neverChecked ? "Not checked yet" : r.when}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
