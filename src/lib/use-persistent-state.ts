"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState that survives a refresh. The first render always uses `initial` so server and
 * client markup match; the stored value is applied right after mount. Storage can be
 * blocked or full, so every access is guarded and the app keeps working without it.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* unreadable or blocked storage: start fresh */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  }, [key, value, hydrated]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, hydrated, reset] as const;
}
