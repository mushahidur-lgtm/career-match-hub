"use client";

import { useSyncExternalStore } from "react";

/**
 * Remembers which saved items the browser refused to store (usually because its storage is full), so the app
 * can say so. Without this a failed save is silent, and the next reload would quietly lose recent changes.
 */
const failed = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];

function publish() {
  snapshot = [...failed].sort();
  for (const l of listeners) l();
}

export function markSaved(key: string): void {
  if (failed.delete(key)) publish();
}

export function markFailed(key: string): void {
  if (!failed.has(key)) {
    failed.add(key);
    publish();
  }
}

/** Keys that could not be saved right now. Empty when everything is being saved. */
export function useUnsavedKeys(): readonly string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => [] as readonly string[],
  );
}
