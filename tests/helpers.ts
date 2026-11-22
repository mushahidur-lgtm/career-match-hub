import type { Job, SavedJob } from "@/types/job";

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    title: "Data Engineer",
    company: "Acme",
    location: "Ottawa, ON",
    workMode: "Hybrid",
    employmentType: "Full-time",
    category: "Data and analytics",
    salary: { min: 110_000, max: 130_000, currency: "CAD", period: "year", estimated: false },
    postedAt: "2026-11-01T00:00:00Z",
    description: "Build pipelines with Python and SQL.",
    descriptionTruncated: false,
    applyUrl: "https://example.com/apply",
    source: "adzuna",
    match: null,
    ...over,
  };
}

export function makeSaved(job: Job, over: Partial<SavedJob> = {}): SavedJob {
  return { job, status: "Interested", notes: "", savedAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z", ...over };
}

/** A Storage stand-in backed by a Map. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
