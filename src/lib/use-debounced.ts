"use client";

import { useEffect, useState } from "react";

/** Follows `value` after it has stopped changing for `ms`, so typing does not refilter on every key. */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
