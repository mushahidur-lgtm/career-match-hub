import type { SearchFilters, SearchPreferences } from "@/types/job";

/** The calendar date and hour in Toronto, which is where "8:00 AM ET" is measured. Handles daylight saving. */
export function torontoParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export const RUN_HOUR = 8;

/**
 * Whether the morning run is due. It is due from 8:00 in Toronto until the day ends, and only once a day.
 * "From 8:00" rather than "at 8:00" because GitHub often starts scheduled jobs late, and an exact-hour test
 * would skip the whole day when that happens.
 */
export function isDue(now: Date, alreadyRanToday: boolean, force = false): boolean {
  if (force) return true;
  return !alreadyRanToday && torontoParts(now).hour >= RUN_HOUR;
}

/**
 * The searches for one morning: your primary roles, in each of your first few cities, up to a cap on the number
 * of job-board calls. Cities earlier in your list in Settings are searched first.
 */
export function planQueries(prefs: Pick<SearchPreferences, "primaryRoles" | "locations" | "minSalary">, max: number): SearchFilters[] {
  const roles = prefs.primaryRoles.map((r) => r.trim()).filter(Boolean);
  const places = prefs.locations.map((l) => l.trim()).filter(Boolean);
  if (!roles.length || !places.length || max < 1) return [];
  const perRole = Math.max(1, Math.floor(max / roles.length));
  const out: SearchFilters[] = [];
  for (const query of roles) {
    for (const location of places.slice(0, perRole)) {
      out.push({ query, location, category: "All", workMode: "All", employmentType: "Permanent full-time", minSalary: prefs.minSalary });
    }
  }
  return out.slice(0, max);
}
