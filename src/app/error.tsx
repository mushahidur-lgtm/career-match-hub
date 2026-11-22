"use client";

import { useEffect } from "react";

/** Saves every Career Match Hub key as-is, so nothing is lost if bad data is what crashed the page. */
function downloadRawData() {
  try {
    const dump: Record<string, string | null> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("cmh:")) dump[k] = window.localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "career-match-hub-raw-data.json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* storage unavailable */
  }
}

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted">
        The page hit an unexpected error. Your resume, saved jobs and notes are stored in this browser and have not been deleted.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand">
          Try again
        </button>
        <button type="button" onClick={downloadRawData} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">
          Download my saved data
        </button>
      </div>
    </div>
  );
}
