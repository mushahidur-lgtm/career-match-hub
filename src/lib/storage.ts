import { DEFAULT_PREFERENCES } from "@/types/job";

/** Version of the browser storage layout. Bump it and add a step to `migrateStorage` when the layout changes. */
export const STORAGE_VERSION = 4;
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

  if (current < 4) {
    snapshot = takeSnapshot(s, 4, current) || snapshot;
    // Saved jobs become applications under a new key. The old key is left alone for rollback.
    if (!upgradeSavedToApplications(s)) return { migrated: false, snapshot };
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

const LEGACY_STATUS: Record<string, string> = { Saved: "Interested", Interviewing: "Interview" };

/** Copies cmh:saved to cmh:applications with the new status names. Returns false if the write failed, so it is retried. */
function upgradeSavedToApplications(s: StorageLike): boolean {
  try {
    const existing = s.getItem("cmh:applications");
    if (existing !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(existing);
      } catch {
        return true;
      }
      if (!Array.isArray(parsed) || parsed.length > 0) return true;
    }
    const raw = s.getItem("cmh:saved");
    if (!raw) return true;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || list.length === 0) return true;
    const mapped = list.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const e = entry as { status?: unknown };
      return typeof e.status === "string" && LEGACY_STATUS[e.status] ? { ...entry, status: LEGACY_STATUS[e.status] } : entry;
    });
    s.setItem("cmh:applications", JSON.stringify(mapped));
    return true;
  } catch {
    return false;
  }
}

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

/** An old key paired with the key that replaced it. The old one is a leftover once the new one holds the data. */
const REPLACED: { old: string; now: string }[] = [
  { old: "cmh:resume", now: "cmh:resumes" },
  { old: "cmh:profile", now: "cmh:resumes" },
  { old: "cmh:saved", now: "cmh:applications" },
];

const arrayLength = (s: StorageLike, key: string): number | null => {
  try {
    const v = JSON.parse(s.getItem(key) ?? "null");
    return Array.isArray(v) ? v.length : null;
  } catch {
    return null;
  }
};

/** Old keys whose data now lives under the new key, so they are only copies. An empty new list never counts, since a failed attempt leaves one. */
function legacyLeftovers(s: StorageLike): string[] {
  return REPLACED.filter(({ old, now }) => {
    if (s.getItem(old) === null) return false;
    const replacement = arrayLength(s, now);
    if (replacement && replacement > 0) return true;
    // Nothing to lose when the old key held no items either.
    return old === "cmh:saved" && replacement !== null && arrayLength(s, old) === 0;
  }).map((r) => r.old);
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
