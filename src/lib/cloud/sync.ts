import { mergeResumes, mergeSavedJobs, type AppData } from "@/lib/backup";
import { mergeFeedback } from "@/lib/feedback";
import { mergeContactStores } from "@/lib/contacts/model";
import { EMPTY_INTEL, mergeIntel } from "@/lib/history";
import { EMPTY_CONTACTS } from "@/types/contacts";
import { EMPTY_WATCHLIST } from "@/types/watchlist";
import { withoutContactDetails, withoutResumeContactDetails } from "./redact";
import { mergeWatchlists } from "@/lib/watchlist/model";

/**
 * Decisions for keeping two copies of your data in step. Nothing here touches storage or the network,
 * so the rules that protect your data (never overwrite a copy you have not seen) can be tested.
 */

export interface SyncMemory {
  /** Whether you turned sync on in this browser. */
  enabled: boolean;
  /** The cloud version this browser last saw, 0 if it never has. */
  lastVersion: number;
  /** Fingerprint of the data as it was when it last matched the cloud. */
  lastHash: string | null;
  /** Daily runs already added to the history here, so none is counted twice. */
  importedRuns: string[];
  /** Whose copy this memory is about. A different account signing in here starts from scratch. */
  userId: string | null;
}

export const NO_SYNC: SyncMemory = { enabled: false, lastVersion: 0, lastHash: null, importedRuns: [], userId: null };

export type SyncAction =
  /** Nothing to do. */
  | "none"
  /** Send this browser's data to the cloud. */
  | "push"
  /** Take the cloud's data, because nothing here changed since the last sync. */
  | "pull"
  /** Both changed. Combine them without losing either, then send the result. */
  | "merge"
  /** The cloud copy was deleted after this browser had synced with it. Ask before sending anything. */
  | "gone";

export function planSync(input: { cloudVersion: number | null; memory: SyncMemory; localHash: string; localEmpty: boolean }): SyncAction {
  const { cloudVersion, memory, localHash, localEmpty } = input;
  const dirty = localHash !== memory.lastHash;

  if (cloudVersion === null) {
    if (memory.lastVersion > 0) return "gone";
    return localEmpty ? "none" : "push";
  }
  // First time here, or the cloud copy is not the one last seen.
  if (memory.lastVersion === 0) return localEmpty ? "pull" : "merge";
  if (cloudVersion !== memory.lastVersion) return dirty ? "merge" : "pull";
  return dirty ? "push" : "none";
}

/**
 * Combines two copies without losing anything from either: resumes and applications by identity, history by id.
 * Settings and filters stay as they are here. A deletion made on one device is not carried over by a merge,
 * which is why a merge happens only when both copies changed.
 */
export function mergeAppData(local: AppData, cloud: AppData): AppData {
  // The cloud copy lacks contact details, so the same resume added on two devices is compared without them.
  const bare = (text: string) => withoutContactDetails(text.trim());
  const have = new Set(local.resumes.map((r) => bare(r.text)));
  return {
    resumes: mergeResumes(local.resumes, cloud.resumes.filter((r) => !have.has(bare(r.text)))),
    activeResumeId: local.activeResumeId ?? cloud.activeResumeId,
    filters: local.filters,
    preferences: local.preferences,
    saved: mergeSavedJobs(local.saved, cloud.saved),
    ...(local.feedback || cloud.feedback ? { feedback: mergeFeedback(local.feedback ?? [], cloud.feedback ?? []) } : {}),
    intel: mergeIntel(local.intel ?? EMPTY_INTEL, cloud.intel ?? EMPTY_INTEL),
    contacts: mergeContactStores(local.contacts ?? EMPTY_CONTACTS, cloud.contacts ?? EMPTY_CONTACTS),
    watchlist: mergeWatchlists(local.watchlist ?? EMPTY_WATCHLIST, cloud.watchlist ?? EMPTY_WATCHLIST),
  };
}

/**
 * What is sent to the cloud. Cached lookups are left out: they are large, and cheap to run again. Whatever came from a
 * resume goes without email addresses, phone numbers and profile links. The original files are never stored anywhere.
 */
export const forCloud = (d: AppData): AppData => {
  const out = withoutResumeContactDetails(d);
  return out.contacts ? { ...out, contacts: { ...out.contacts, finds: [] } } : out;
};

export const isEmptyData = (d: AppData): boolean =>
  d.resumes.length === 0 && d.saved.length === 0 && (d.intel?.history.length ?? 0) === 0 && (d.intel?.seen.length ?? 0) === 0 && (d.contacts?.contacts.length ?? 0) === 0 && (d.contacts?.deletedIds.length ?? 0) === 0 && (d.watchlist?.sites.length ?? 0) === 0 && (d.watchlist?.deletedIds.length ?? 0) === 0;

/**
 * A short fingerprint of what is synced, so a change can be noticed. Order does not matter, and the search filters
 * are left out: they are per-device and change constantly, and must not cause a save. The selected resume is included, because the morning run uses it, and a pull applies it so two devices agree.
 */
export function hashData(d: AppData): string {
  const by = <T,>(list: T[], key: (x: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
  const text = JSON.stringify({
    resumes: by(d.resumes, (r) => r.id),
    activeResumeId: d.activeResumeId,
    preferences: d.preferences,
    saved: by(d.saved, (s) => s.job.id),
    history: by(d.intel?.history ?? [], (h) => h.id),
    seen: by(d.intel?.seen ?? [], (j) => j.key),
    // Saved contacts and deletions are synced. Cached lookups (finds) are not part of the fingerprint.
    contacts: by(d.contacts?.contacts ?? [], (c) => c.id),
    deleted: [...(d.contacts?.deletedIds ?? [])].sort(),
    sites: by(d.watchlist?.sites ?? [], (s) => s.id),
    deletedSites: [...(d.watchlist?.deletedIds ?? [])].sort(),
  });
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
