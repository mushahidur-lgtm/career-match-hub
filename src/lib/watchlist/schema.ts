import { z } from "zod";
import { stashUnreadable } from "@/lib/storage";
import { WATCH_LIMITS as L, SITE_CATEGORIES, type WatchlistStore, type WatchSite } from "@/types/watchlist";

const str = (max: number) => z.string().max(max);

export const WatchSiteSchema = z.object({
  id: str(80),
  name: str(L.name),
  url: str(L.url),
  category: z.enum(SITE_CATEGORIES),
  everyDays: z.number().int().min(1).max(365),
  lastCheckedAt: str(10).nullable(),
  checks: z.number().int().min(0).max(100_000),
  notes: str(L.notes),
  origin: z.enum(["suggested", "manual"]),
  createdAt: str(40),
  updatedAt: str(40),
});

/** Reads the stored watchlist one site at a time, so one damaged entry never hides the rest. */
export function readWatchlist(value: unknown): { store: WatchlistStore; rejected: unknown[] } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as { sites?: unknown; deletedIds?: unknown };
  if (!Array.isArray(v.sites)) return undefined;
  const rejected: unknown[] = [];
  const sites: WatchSite[] = [];
  const ids = new Set<string>();
  for (const e of v.sites) {
    const r = WatchSiteSchema.safeParse(e);
    // Only web addresses are ever kept, whatever the stored data says.
    if (!r.success || ids.has(r.data.id) || !/^https?:\/\//i.test(r.data.url)) {
      rejected.push(e);
      continue;
    }
    ids.add(r.data.id);
    sites.push(r.data as WatchSite);
  }
  const deletedIds = (Array.isArray(v.deletedIds) ? v.deletedIds : []).filter((x): x is string => typeof x === "string" && x.length <= 80).slice(-L.deletedMax);
  return { store: { sites, deletedIds }, rejected };
}

export function stashWatchlist(entries: unknown[]): void {
  try {
    stashUnreadable(window.localStorage, `cmh:watchlist:entries:${Date.now()}`, JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}
