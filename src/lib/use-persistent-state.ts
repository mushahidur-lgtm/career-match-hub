"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { migrateStorage, stashUnreadable } from "./storage";
import { makeRoom, markFailed, markSaved, registerSpaceReleaser, useRetryToken } from "./storage-health";

let migrationRan = false;

/**
 * useState that survives a refresh. The first render always uses `initial` so server and
 * client markup match; the stored value is applied right after mount.
 *
 * Stored data is untrusted. If `validate` is given and returns undefined, or the JSON is broken,
 * the raw value is kept under a "recovered" key (never overwritten silently) and `initial`
 * is used. Storage can be blocked or full, so every access is guarded.
 */
export function usePersistentState<T>(key: string, initial: T, validate?: (value: unknown) => T | undefined, shrink?: (value: T) => T | null) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const loaded = useRef(false);
  const validator = useRef(validate);
  const retry = useRetryToken(key);
  const latest = useRef(value);
  const shrinkRef = useRef(shrink);
  useEffect(() => {
    latest.current = value;
    shrinkRef.current = shrink;
  });

  // Data that can be given up in part (search history) offers space when something more important cannot be saved.
  useEffect(() => {
    if (!shrinkRef.current) return;
    return registerSpaceReleaser(() => {
      const smaller = shrinkRef.current?.(latest.current);
      if (!smaller) return false;
      setValue(smaller);
      return true;
    });
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      if (!migrationRan) {
        migrationRan = true;
        migrateStorage(window.localStorage);
      }
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        let parsed: unknown;
        let readable = true;
        try {
          parsed = JSON.parse(raw);
        } catch {
          readable = false;
        }
        const checked = readable ? (validator.current ? validator.current(parsed) : (parsed as T)) : undefined;
        if (checked === undefined) {
          stashUnreadable(window.localStorage, key, raw);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRecovered(true);
        } else {
          setValue(checked);
        }
      }
    } catch {
      /* blocked storage: start fresh */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      markSaved(key);
    } catch {
      /* Storage full or blocked. */
      const smaller = shrink?.(value);
      if (smaller) {
        // This data can give up part of itself (search history): cut it down and write the smaller copy.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(smaller);
        return;
      }
      // This change is not being saved, and the app says so. If the data cannot spare anything itself, ask the
      // data that can (search history) to make room, then try again, so history gives way to applications.
      markFailed(key);
      if (!shrink) makeRoom();
    }
    // `retry` changes when a failed save is asked to run again, for example after space was freed.
  }, [key, value, hydrated, shrink, retry]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, hydrated, reset, recovered] as const;
}
