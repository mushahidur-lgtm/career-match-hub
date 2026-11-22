import { buildBackup, mergeResumes, mergeSavedJobs, type AppData } from "@/lib/backup";
import { EMPTY_INTEL, mergeIntel } from "@/lib/history";

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
}

export const NO_SYNC: SyncMemory = { enabled: false, lastVersion: 0, lastHash: null, importedRuns: [] };

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
  return {
    resumes: mergeResumes(local.resumes, cloud.resumes),
    activeResumeId: local.activeResumeId ?? cloud.activeResumeId,
    filters: local.filters,
    preferences: local.preferences,
    saved: mergeSavedJobs(local.saved, cloud.saved),
    intel: mergeIntel(local.intel ?? EMPTY_INTEL, cloud.intel ?? EMPTY_INTEL),
  };
}

export const isEmptyData = (d: AppData): boolean =>
  d.resumes.length === 0 && d.saved.length === 0 && (d.intel?.history.length ?? 0) === 0 && (d.intel?.seen.length ?? 0) === 0;

/** A short fingerprint of what would be synced. Not secure; it only notices change. */
export function hashData(d: AppData): string {
  // exportedAt is left out so the fingerprint does not change on its own.
  const text = buildBackup(d, new Date(0));
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
