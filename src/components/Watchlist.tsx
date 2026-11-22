"use client";

import { Check, ExternalLink, Eye, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { SUGGESTED_SITES, nextCheck, normalizeUrl, watchReminders } from "@/lib/watchlist/model";
import { webLink } from "@/lib/contacts/links";
import { CHECK_EVERY, WATCH_LIMITS as L, SITE_CATEGORIES, type SiteCategory, type WatchSite, type WatchlistStore } from "@/types/watchlist";
import type { SearchPreferences } from "@/types/job";
import { Badge, Notice, inputClass, primaryButton, secondaryButton } from "./ui";

export interface WatchlistActions {
  add: (input: { name: string; url: string; category?: SiteCategory; everyDays?: number; notes?: string; origin?: WatchSite["origin"] }) => string | null;
  update: (id: string, patch: Partial<WatchSite>) => void;
  remove: (id: string) => void;
  markChecked: (id: string) => void;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const EVERY_LABEL: Record<number, string> = { 1: "every day", 3: "every 3 days", 7: "every week", 14: "every 2 weeks" };

/** Official career sites you check by hand. Nothing here reads those sites: you open them, look, and say when you have checked. */
export function Watchlist({ store, preferences, actions, onLog }: { store: WatchlistStore; preferences: SearchPreferences; actions: WatchlistActions; onLog: (site: WatchSite) => void }) {
  const [form, setForm] = useState({ name: "", url: "", category: "Other" as SiteCategory, everyDays: 7 });
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const due = useMemo(() => watchReminders(store.sites), [store.sites]);
  const added = new Set(store.sites.map((s) => normalizeUrl(s.url)));
  const suggestions = SUGGESTED_SITES.filter((s) => !added.has(normalizeUrl(s.url)));

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = actions.add({ name: form.name, url: form.url, category: form.category, everyDays: form.everyDays });
    setError(problem);
    if (!problem) setForm({ name: "", url: "", category: "Other", everyDays: 7 });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Career site watchlist</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">Government, crown corporation and company career sites that are not covered by the job boards. You open each one, look for jobs that fit, and tell the app when you have checked.</p>
      </div>

      <Notice tone="info">This app does not read, copy or scrape these sites. It keeps the addresses, reminds you when a check is due, and helps you log a posting you find as an application.</Notice>

      <section aria-label="What to search for" className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-base font-semibold">What to search for on each site</h2>
        <p className="text-sm text-muted">From your Settings.</p>
        <p className="text-sm">
          <span className="font-medium">Roles:</span> {[...preferences.primaryRoles, ...preferences.secondaryRoles.slice(0, 4)].join(", ") || "none set"}
        </p>
        <p className="text-sm">
          <span className="font-medium">Places:</span> {preferences.locations.join(", ") || "none set"}
        </p>
      </section>

      {due.length > 0 && (
        <section aria-label="Due now" className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Due now</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {due.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={r.overdue ? "warn" : "neutral"}>{r.neverChecked ? "Not checked yet" : r.when}</Badge>
                  <a href={webLink(r.url) ?? "#"} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                    Open <ExternalLink className="size-4" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-label="Suggested sites" className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Suggested sites</h2>
          <p className="max-w-prose text-sm text-muted">Addresses found through a web search on 2026-11-22. Open one to confirm it is the page you expect before relying on it. For other crown corporations or employers, add the careers page you find.</p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {s.category} · {host(s.url)}. {s.notes}
                  </span>
                </span>
                <button type="button" className={secondaryButton} onClick={() => actions.add({ name: s.name, url: s.url, category: s.category, notes: s.notes, origin: "suggested", everyDays: 7 })}>
                  <Plus className="size-4" aria-hidden /> Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Add a site" className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-display text-base font-semibold">Add a site</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="w-name">Name</label>
              <input id="w-name" className={inputClass} maxLength={L.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="For example: CMHC careers" required />
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="w-url">Address of the careers page</label>
              <input id="w-url" className={inputClass} maxLength={L.url} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://" required />
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="w-cat">Kind of employer</label>
              <select id="w-cat" className={inputClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as SiteCategory }))}>
                {SITE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <label htmlFor="w-every">Remind me to check</label>
              <select id="w-every" className={inputClass} value={form.everyDays} onChange={(e) => setForm((f) => ({ ...f, everyDays: Number(e.target.value) }))}>
                {CHECK_EVERY.map((d) => (
                  <option key={d} value={d}>
                    {EVERY_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={primaryButton}>
            <Plus className="size-4" aria-hidden /> Add to watchlist
          </button>
        </form>
      </section>

      <section aria-label="Your sites" className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          Your sites <span className="text-sm font-normal text-muted">({store.sites.length})</span>
        </h2>
        {store.sites.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <Eye className="size-4 text-muted" aria-hidden /> Nothing on your watchlist yet
            </h3>
            <p className="mt-2 max-w-prose text-sm text-muted">Add one of the suggested sites above, or the careers page of any employer you want to follow.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {store.sites.map((s) => {
              const link = webLink(s.url);
              const next = nextCheck(s);
              const overdue = watchReminders([s])[0];
              return (
                <li key={s.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold">{s.name}</h3>
                      <p className="text-xs text-muted">
                        {s.category} · {host(s.url)}
                      </p>
                    </div>
                    <Badge tone={overdue ? (overdue.overdue ? "warn" : "info") : "neutral"}>{s.lastCheckedAt ? (overdue ? overdue.when : `Next check ${next}`) : "Not checked yet"}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {s.lastCheckedAt ? `Last checked ${s.lastCheckedAt}` : "You have not marked this checked yet"}, {EVERY_LABEL[s.everyDays] ?? "every week"}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                        Open site <ExternalLink className="size-4" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                    <button type="button" className={primaryButton} onClick={() => actions.markChecked(s.id)}>
                      <Check className="size-4" aria-hidden /> I checked it today
                    </button>
                    <button type="button" className={secondaryButton} onClick={() => onLog(s)}>
                      Log a posting I found
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                      <label htmlFor={`n-${s.id}`}>Notes</label>
                      <input id={`n-${s.id}`} className={inputClass} maxLength={L.notes} value={s.notes} onChange={(e) => actions.update(s.id, { notes: e.target.value })} placeholder="For example: search by NOC code 21211" />
                    </div>
                    <div className="flex flex-col gap-1.5 text-sm font-medium">
                      <label htmlFor={`e-${s.id}`}>Remind me</label>
                      <select id={`e-${s.id}`} className={inputClass} value={s.everyDays} onChange={(e) => actions.update(s.id, { everyDays: Number(e.target.value) })}>
                        {CHECK_EVERY.map((d) => (
                          <option key={d} value={d}>
                            {EVERY_LABEL[d]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {confirm === s.id ? (
                    <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">Remove {s.name} from your watchlist?</span>
                      <button type="button" className={primaryButton} onClick={() => { actions.remove(s.id); setConfirm(null); }}>
                        Yes, remove
                      </button>
                      <button type="button" className={secondaryButton} onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted underline-offset-2 hover:underline" onClick={() => setConfirm(s.id)}>
                      <Trash2 className="size-3.5" aria-hidden /> Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
