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
  const copy: Record<string, string> = {};
  for (const k of keys) copy[k] = s.getItem(k) ?? "";
  s.setItem(key, JSON.stringify({ takenAt: new Date().toISOString(), fromVersion, keys: copy }));
  return true;
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
    upgradeSingleResume(s);
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

function upgradeSingleResume(s: StorageLike): void {
  try {
    if (s.getItem("cmh:resumes") !== null) return;
    const rawResume = s.getItem("cmh:resume");
    const rawProfile = s.getItem("cmh:profile");
    if (!rawResume || !rawProfile) return;
    const resume = JSON.parse(rawResume) as { text?: unknown; fileName?: unknown; uploadedAt?: unknown } | null;
    const profile = JSON.parse(rawProfile) as unknown;
    if (!resume || typeof resume.text !== "string" || !profile || typeof profile !== "object") return;
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
    // The snapshot taken just before this step holds the originals, so the old keys can go.
    s.removeItem("cmh:resume");
    s.removeItem("cmh:profile");
  } catch {
    /* leave the old keys in place if anything is unreadable; the snapshot keeps them too */
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

/** Removes the upgrade snapshots. They hold a full copy of your old data, resume included. */
export function clearSnapshots(s: StorageLike): number {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(SNAPSHOT_PREFIX)) keys.push(k);
  }
  for (const k of keys) s.removeItem(k);
  return keys.length;
}

export function hasSnapshots(s: StorageLike): boolean {
  for (let i = 0; i < s.length; i++) if (s.key(i)?.startsWith(SNAPSHOT_PREFIX)) return true;
  return false;
}
