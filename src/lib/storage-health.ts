"use client";

import { useSyncExternalStore } from "react";

/**
 * Remembers which saved items the browser refused to store (usually because its storage is full), so the app
 * can say so, try again, and make room. Without this a failed save is silent and the next reload quietly loses
 * recent changes.
 */
const failed = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];
let retryCount = 0;

function publish() {
  snapshot = [...failed].sort();
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function markSaved(key: string): void {
  if (failed.delete(key)) publish();
}

export function markFailed(key: string): void {
  if (!failed.has(key)) {
    failed.add(key);
    publish();
  }
}

/** Asks every item that failed to save to try again, for example after space was freed. */
export function retryFailedSaves(): void {
  if (!failed.size) return;
  retryCount += 1;
  publish();
}

/** Keys that could not be saved right now. Empty when everything is being saved. */
export function useUnsavedKeys(): readonly string[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => [] as readonly string[]);
}

/** Changes each time a retry is requested, but only for a key that is currently failing, so other keys are not rewritten. */
export function useRetryToken(key: string): number {
  return useSyncExternalStore(subscribe, () => (failed.has(key) ? retryCount : 0), () => 0);
}

/**
 * Things that can give up space to let more important data be saved (search history). Each returns true when it
 * freed something. The more important data is not asked to shrink: this is how history gives way to applications.
 */
const releasers = new Set<() => boolean>();

export function registerSpaceReleaser(release: () => boolean): () => void {
  releasers.add(release);
  return () => releasers.delete(release);
}

/** Frees space from whatever can spare it, then asks failed saves to try again. Returns whether anything was freed. */
export function makeRoom(): boolean {
  let freed = false;
  for (const release of releasers) freed = release() || freed;
  // Let the smaller copy be written first, then retry what was refused.
  if (freed) setTimeout(retryFailedSaves, 150);
  return freed;
}
