/**
 * Official career sites you check by hand: government, crown corporations and employers that post only on their own site.
 * The app scrapes none of them. It keeps the address, reminds you when a check is due, and helps you log what you find.
 */

export const SITE_CATEGORIES = ["Federal government", "Provincial government", "Municipal government", "Crown corporation", "Private company", "Other"] as const;
export type SiteCategory = (typeof SITE_CATEGORIES)[number];

/** How often to be reminded, in days. */
export const CHECK_EVERY = [1, 3, 7, 14] as const;

export interface WatchSite {
  id: string;
  name: string;
  /** The address of the careers or search page. Only web addresses are accepted. */
  url: string;
  category: SiteCategory;
  everyDays: number;
  /** The last day you checked it, "YYYY-MM-DD", or null if you never have. */
  lastCheckedAt: string | null;
  /** How many times you have marked it checked. */
  checks: number;
  notes: string;
  origin: "suggested" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistStore {
  sites: WatchSite[];
  /** Deleted ids, so syncing another device cannot bring a site back. */
  deletedIds: string[];
}

export const EMPTY_WATCHLIST: WatchlistStore = { sites: [], deletedIds: [] };

export const WATCH_LIMITS = { sitesMax: 100, deletedMax: 500, name: 120, url: 2000, notes: 2000 } as const;
