import { z } from "zod";
import type { JobInsights } from "@/lib/insights";

const KEY = "cmh:insights";
const MAX_ENTRIES = 20;
const str = (n: number) => z.string().max(n);

export const JobInsightsSchema = z.object({
  rewrites: z.array(z.object({ original: str(400), suggestion: str(500), why: str(300) })).max(5),
  projects: z.array(z.object({ line: str(400), why: str(300) })).max(3),
  summary: z.object({
    fit: str(600),
    talkingPoints: z.array(z.object({ point: str(400), evidence: str(400) })).max(5),
    honestFraming: z.array(str(400)).max(4),
    questionsToAsk: z.array(str(400)).max(4),
    checklist: z.array(str(400)).max(6),
  }),
});

const EntrySchema = z.object({ at: z.string(), data: JobInsightsSchema });
const StoreSchema = z.record(z.string(), EntrySchema);

/** Suggestions are tied to one job and one version of the resume, so a changed resume asks again. */
export const insightsKey = (jobId: string, resumeId: string, resumeLength: number) => `${jobId}|${resumeId}|${resumeLength}`;

function readStore(): z.infer<typeof StoreSchema> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function loadInsights(key: string): { at: string; data: JobInsights } | null {
  return readStore()[key] ?? null;
}

export function saveInsights(key: string, data: JobInsights, now = new Date()): void {
  try {
    const store = readStore();
    store[key] = { at: now.toISOString(), data };
    const newest = Object.entries(store).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    /* storage full or blocked: the suggestions still show this time */
  }
}
