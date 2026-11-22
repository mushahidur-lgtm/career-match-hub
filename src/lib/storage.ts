import { DEFAULT_PREFERENCES } from "@/types/job";

/** Version of the browser storage layout. Bump it and add a step to `migrate` when the layout changes. */
export const STORAGE_VERSION = 2;
export const VERSION_KEY = "cmh:schema";
export const LEGACY_SNAPSHOT_KEY = "cmh:backup:pre-v2";
export const RECOVERED_PREFIX = "cmh:recovered:";

/** The part of the Storage API we use, so tests can pass a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const appKeys = (s: StorageLike): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith("cmh:") && !k.startsWith("cmh:backup:") && !k.startsWith(RECOVERED_PREFIX) && k !== VERSION_KEY) keys.push(k);
  }
  return keys;
};

/**
 * Upgrades stored data in place. Before changing anything it saves a snapshot of every
 * existing key, so a bad upgrade can always be undone from Settings. Safe to run repeatedly.
 */
export function migrateStorage(s: StorageLike): { migrated: boolean; snapshot: boolean } {
  const current = Number(s.getItem(VERSION_KEY) ?? "1");
  if (current >= STORAGE_VERSION) return { migrated: false, snapshot: false };

  let snapshot = false;
  const keys = appKeys(s);
  if (keys.length && s.getItem(LEGACY_SNAPSHOT_KEY) === null) {
    const copy: Record<string, string> = {};
    for (const k of keys) copy[k] = s.getItem(k) ?? "";
    s.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify({ takenAt: new Date().toISOString(), fromVersion: current, keys: copy }));
    snapshot = true;
  }

  // v1 -> v2: the search now defaults to permanent full-time at the preferred minimum salary.
  // Filters are upgraded only if they are still the untouched v1 defaults (any type, no
  // minimum), so a deliberate choice is never overwritten. Everything else stays as it was.
  upgradeUntouchedFilters(s);
  s.setItem(VERSION_KEY, String(STORAGE_VERSION));
  return { migrated: true, snapshot };
}

/** Keeps an unreadable value so it can be recovered by hand instead of being overwritten. */
export function stashUnreadable(s: StorageLike, key: string, raw: string): void {
  try {
    s.setItem(`${RECOVERED_PREFIX}${key}`, JSON.stringify({ at: new Date().toISOString(), raw }));
  } catch {
    /* storage is full: nothing more we can do */
  }
}

export function listRecovered(s: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(RECOVERED_PREFIX)) out.push(k.slice(RECOVERED_PREFIX.length));
  }
  return out;
}

function upgradeUntouchedFilters(s: StorageLike): void {
  try {
    const raw = s.getItem("cmh:filters");
    if (!raw) return;
    const f = JSON.parse(raw) as Record<string, unknown>;
    if (f && f.employmentType === "All" && f.minSalary === null) {
      s.setItem("cmh:filters", JSON.stringify({ ...f, employmentType: "Permanent full-time", minSalary: DEFAULT_PREFERENCES.minSalary }));
    }
  } catch {
    /* unreadable filters are handled when they are loaded */
  }
}
