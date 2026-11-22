import { DEFAULT_PREFERENCES } from "@/types/job";

/** Version of the browser storage layout. Bump it and add a step to `migrateStorage` when the layout changes. */
export const STORAGE_VERSION = 3;
export const VERSION_KEY = "cmh:schema";
export const RECOVERED_PREFIX = "cmh:recovered:";
export const SNAPSHOT_PREFIX = "cmh:backup:";
/** Snapshot taken before the upgrade to layout 2 (kept name; older tests and backups refer to it). */
export const LEGACY_SNAPSHOT_KEY = "cmh:backup:pre-v2";
export const snapshotKey = (target: number) => `${SNAPSHOT_PREFIX}pre-v${target}`;

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
    if (k && k.startsWith("cmh:") && !k.startsWith(SNAPSHOT_PREFIX) && !k.startsWith(RECOVERED_PREFIX) && k !== VERSION_KEY) keys.push(k);
  }
  return keys;
};

/** Copies every app key into one snapshot entry before a step changes anything. Never overwrites an older snapshot. */
function takeSnapshot(s: StorageLike, target: number, fromVersion: number): boolean {
  const key = snapshotKey(target);
  const keys = appKeys(s);
  if (!keys.length || s.getItem(key) !== null) return false;
  try {
    const copy: Record<string, string> = {};
    for (const k of keys) copy[k] = s.getItem(k) ?? "";
    s.setItem(key, JSON.stringify({ takenAt: new Date().toISOString(), fromVersion, keys: copy }));
    return true;
  } catch {
    // Storage is full or blocked. The step still runs: it never deletes anything, so the data stays where it was.
    return false;
  }
}

export interface MigrationResult {
  migrated: boolean;
  /** True if a snapshot of the previous data was saved. */
  snapshot: boolean;
}

/**
 * Upgrades stored data in place, one layout version at a time. Before each step it saves a
 * snapshot of everything, so a bad upgrade can be undone from Settings. Safe to run repeatedly.
 */
export function migrateStorage(s: StorageLike): MigrationResult {
  const current = Number(s.getItem(VERSION_KEY) ?? "1");
  if (current >= STORAGE_VERSION) return { migrated: false, snapshot: false };
  let snapshot = false;

  if (current < 2) {
    snapshot = takeSnapshot(s, 2, current) || snapshot;
    // The search now defaults to permanent full-time at the preferred minimum salary.
    // Filters are upgraded only if they are still the untouched v1 defaults (any type, no
    // minimum), so a deliberate choice is never overwritten.
    upgradeUntouchedFilters(s);
  }

  if (current < 3) {
    snapshot = takeSnapshot(s, 3, current) || snapshot;
    // One resume and profile become the first of several resume versions.
    if (!upgradeSingleResume(s)) return { migrated: false, snapshot };
  }

  s.setItem(VERSION_KEY, String(STORAGE_VERSION));
  return { migrated: true, snapshot };
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

export const LEGACY_VERSION_ID = "legacy-1";

/** Name for a resume version made from a file name. */
export const nameFromFile = (fileName: string | null, fallback: string) =>
  (fileName ?? "").replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || fallback;

/** The keys layout 2 used for the one resume. They are left in place so rolling back to the previous release still works. */
export const LEGACY_RESUME_KEYS = ["cmh:resume", "cmh:profile"] as const;

/** Returns false only when a step that should have worked failed, so the upgrade is tried again next time. */
function upgradeSingleResume(s: StorageLike): boolean {
  try {
    const existing = s.getItem("cmh:resumes");
    if (existing !== null) {
      // An empty list is what a failed earlier attempt leaves behind, so it does not count as migrated.
      let parsed: unknown;
      try {
        parsed = JSON.parse(existing);
      } catch {
        return true; // unreadable: the app sets it aside when it loads it
      }
      if (!Array.isArray(parsed) || parsed.length > 0) return true;
    }
    const rawResume = s.getItem("cmh:resume");
    const rawProfile = s.getItem("cmh:profile");
    if (!rawResume || !rawProfile) return true;
    const resume = JSON.parse(rawResume) as { text?: unknown; fileName?: unknown; uploadedAt?: unknown } | null;
    const profile = JSON.parse(rawProfile) as unknown;
    if (!resume || typeof resume.text !== "string" || !profile || typeof profile !== "object") return true;
    const fileName = typeof resume.fileName === "string" ? resume.fileName : null;
    const version = {
      id: LEGACY_VERSION_ID,
      name: nameFromFile(fileName, "My resume"),
      text: resume.text,
      fileName,
      uploadedAt: typeof resume.uploadedAt === "string" ? resume.uploadedAt : new Date().toISOString(),
      profile,
    };
    s.setItem("cmh:resumes", JSON.stringify([version]));
    s.setItem("cmh:activeResume", JSON.stringify(LEGACY_VERSION_ID));
    return true;
  } catch {
    // Unreadable old data is left exactly where it is. A write that failed is retried on the next load.
    return false;
  }
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

/** True when the versions exist, so the layout 2 copies are only a leftover. */
function legacyLeftovers(s: StorageLike): string[] {
  try {
    const versions = JSON.parse(s.getItem("cmh:resumes") ?? "null");
    if (!Array.isArray(versions) || versions.length === 0) return [];
  } catch {
    return [];
  }
  return LEGACY_RESUME_KEYS.filter((k) => s.getItem(k) !== null);
}

/**
 * Removes the upgrade snapshots and the old single-resume copies. They hold a full copy of your
 * previous data, resume text included. The old copies go only if your resume versions exist.
 */
export function clearSnapshots(s: StorageLike): number {
  const keys: string[] = legacyLeftovers(s);
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(SNAPSHOT_PREFIX)) keys.push(k);
  }
  for (const k of keys) s.removeItem(k);
  return keys.length;
}

export function hasSnapshots(s: StorageLike): boolean {
  if (legacyLeftovers(s).length) return true;
  for (let i = 0; i < s.length; i++) if (s.key(i)?.startsWith(SNAPSHOT_PREFIX)) return true;
  return false;
}
