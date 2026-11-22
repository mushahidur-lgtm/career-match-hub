import { addDays, daysBetween, plausibleDay, todayLocal } from "@/lib/applications";
import { webLink } from "@/lib/contacts/links";
import { newId } from "@/lib/ids";
import { CHECK_EVERY, WATCH_LIMITS as L, SITE_CATEGORIES, type SiteCategory, type WatchSite, type WatchlistStore } from "@/types/watchlist";

/**
 * Sites worth watching, offered as one-click additions. Each address was found through a web search on 2026-11-22 and
 * should be confirmed by opening it. They are never added for you, and only these were verified: for any other crown
 * corporation or employer, add the careers page you find yourself.
 */
export const SUGGESTED_SITES: { key: string; name: string; url: string; category: SiteCategory; notes: string }[] = [
  { key: "job-bank", name: "Job Bank (Government of Canada)", url: "https://www.jobbank.gc.ca/", category: "Federal government", notes: "Canada's national job board, with postings from many employers." },
  { key: "gc-jobs", name: "GC Jobs (Public Service Commission)", url: "https://www.canada.ca/en/public-service-commission/jobs/services/gc-jobs/applying-government-canada-jobs-how-to-apply.html", category: "Federal government", notes: "Guidance page for federal public service jobs. It links to the current GC Jobs search, whose address has changed over the years." },
  { key: "gojobs", name: "GOjobs (Ontario Public Service)", url: "https://www.gojobs.gov.on.ca/", category: "Provincial government", notes: "Ontario Public Service postings. The site offers job alerts." },
  { key: "canada-post", name: "Canada Post careers", url: "https://jobs.canadapost.ca", category: "Crown corporation", notes: "Canada Post's own job portal." },
];

const cut = (s: string, n: number) => s.trim().slice(0, n);

export const normalizeUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/+$/, "");

export function clampSite(s: WatchSite): WatchSite {
  return {
    ...s,
    name: cut(s.name, L.name),
    url: cut(s.url, L.url),
    notes: s.notes.slice(0, L.notes),
    everyDays: (CHECK_EVERY as readonly number[]).includes(s.everyDays) ? s.everyDays : 7,
    category: (SITE_CATEGORIES as readonly string[]).includes(s.category) ? s.category : "Other",
    lastCheckedAt: s.lastCheckedAt && plausibleDay(s.lastCheckedAt) ? s.lastCheckedAt : null,
    checks: Math.max(0, Math.min(100_000, Math.floor(s.checks))),
  };
}

export type AddResult = { ok: true; store: WatchlistStore; site: WatchSite } | { ok: false; error: string };

/** Adds a site. The same address is never added twice, and only web addresses are accepted. */
export function addSite(store: WatchlistStore, input: { name: string; url: string; category?: SiteCategory; everyDays?: number; notes?: string; origin?: WatchSite["origin"] }, now = new Date()): AddResult {
  const name = input.name.trim();
  const url = webLink(input.url.trim());
  if (!name) return { ok: false, error: "Enter a name for the site." };
  if (!url) return { ok: false, error: "Enter the address of the page, starting with https://." };
  if (store.sites.some((s) => normalizeUrl(s.url) === normalizeUrl(url))) return { ok: false, error: "That address is already on your watchlist." };
  if (store.sites.length >= L.sitesMax) return { ok: false, error: "Your watchlist is full. Remove a site first." };
  const stamp = now.toISOString();
  const site = clampSite({ id: newId(), name, url, category: input.category ?? "Other", everyDays: input.everyDays ?? 7, lastCheckedAt: null, checks: 0, notes: input.notes ?? "", origin: input.origin ?? "manual", createdAt: stamp, updatedAt: stamp });
  return { ok: true, store: { ...store, sites: [site, ...store.sites] }, site };
}

export const updateSite = (store: WatchlistStore, id: string, patch: Partial<WatchSite>, now = new Date()): WatchlistStore => ({
  ...store,
  sites: store.sites.map((s) => (s.id === id ? clampSite({ ...s, ...patch, id: s.id, updatedAt: now.toISOString() }) : s)),
});

export const removeSite = (store: WatchlistStore, id: string): WatchlistStore => ({
  sites: store.sites.filter((s) => s.id !== id),
  deletedIds: [...new Set([...store.deletedIds, id])].slice(-L.deletedMax),
});

/** You checked the site. Only you can say so: opening the link does not count. */
export const markChecked = (store: WatchlistStore, id: string, now = new Date()): WatchlistStore => ({
  ...store,
  sites: store.sites.map((s) => (s.id === id ? clampSite({ ...s, lastCheckedAt: todayLocal(now), checks: s.checks + 1, updatedAt: now.toISOString() }) : s)),
});

/* ---------- when a check is due ---------- */

export interface SiteReminder {
  id: string;
  siteId: string;
  name: string;
  url: string;
  /** The day a check is due. */
  date: string;
  when: string;
  overdue: boolean;
  daysAway: number;
  neverChecked: boolean;
}

const whenText = (days: number) => (days < 0 ? `Overdue by ${-days} ${days === -1 ? "day" : "days"}` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`);

/** The day the next check is due. A site you have never checked is due the day you added it. */
export function nextCheck(site: Pick<WatchSite, "lastCheckedAt" | "everyDays" | "createdAt">, now = new Date()): string {
  if (site.lastCheckedAt && plausibleDay(site.lastCheckedAt)) return addDays(site.lastCheckedAt, site.everyDays);
  return site.createdAt.slice(0, 10) && plausibleDay(site.createdAt.slice(0, 10)) ? site.createdAt.slice(0, 10) : todayLocal(now);
}

/** Sites due today or overdue, most overdue first. With a horizon, also those due soon. */
export function watchReminders(sites: WatchSite[], now = new Date(), horizon = 0): SiteReminder[] {
  const today = todayLocal(now);
  return sites
    .flatMap((s) => {
      const date = nextCheck(s, now);
      const days = daysBetween(today, date);
      return days > horizon ? [] : [{ id: `site:${s.id}:${date}`, siteId: s.id, name: s.name, url: s.url, date, when: whenText(days), overdue: days < 0, daysAway: days, neverChecked: s.lastCheckedAt === null }];
    })
    .sort((a, b) => a.daysAway - b.daysAway);
}

/* ---------- combining two copies ---------- */

export function mergeWatchlists(a: WatchlistStore, b: WatchlistStore): WatchlistStore {
  const deleted = new Set([...a.deletedIds, ...b.deletedIds]);
  const out: WatchSite[] = [];
  for (const s of [...a.sites, ...b.sites]) {
    if (deleted.has(s.id)) continue;
    const i = out.findIndex((o) => o.id === s.id || normalizeUrl(o.url) === normalizeUrl(s.url));
    if (i < 0) {
      out.push(s);
      continue;
    }
    const [newer, older] = out[i].updatedAt >= s.updatedAt ? [out[i], s] : [s, out[i]];
    const last = [newer.lastCheckedAt, older.lastCheckedAt].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
    out[i] = clampSite({ ...newer, id: out[i].id, lastCheckedAt: last, checks: Math.max(newer.checks, older.checks) });
  }
  return { sites: out.slice(0, L.sitesMax), deletedIds: [...deleted].slice(-L.deletedMax) };
}
