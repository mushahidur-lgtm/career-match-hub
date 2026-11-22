"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { migrateStorage, stashUnreadable } from "./storage";

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
    } catch {
      /* Storage full or blocked. Data that can be given up in part (search history) is cut down so it never crowds out what cannot. */
      const smaller = shrink?.(value);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (smaller) setValue(smaller);
    }
  }, [key, value, hydrated, shrink]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, hydrated, reset, recovered] as const;
}
