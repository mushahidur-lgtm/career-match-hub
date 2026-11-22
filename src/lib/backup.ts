import { z } from "zod";
import type {
  CandidateProfile,
  SavedJob,
  SearchFilters,
  SearchPreferences,
  StoredResume,
} from "@/types/job";
import {
  FiltersSchema,
  PreferencesSchema,
  ProfileSchema,
  ResumeSchema,
  SavedJobsSchema,
} from "./schemas";

export const BACKUP_APP = "career-match-hub";
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface AppData {
  resume: StoredResume | null;
  profile: CandidateProfile | null;
  filters: SearchFilters;
  preferences: SearchPreferences;
  saved: SavedJob[];
}

const BackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object({
    resume: ResumeSchema.nullable(),
    profile: ProfileSchema.nullable(),
    filters: FiltersSchema,
    preferences: PreferencesSchema,
    saved: SavedJobsSchema,
  }),
});

export function buildBackup(data: AppData, now = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

export type ParsedBackup = { ok: true; data: AppData; exportedAt: string } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "That file is too large to be a Career Match Hub backup." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const result = BackupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, error: `That is not a Career Match Hub backup, or it is damaged${where}.` };
  }
  return { ok: true, data: result.data.data as AppData, exportedAt: result.data.exportedAt };
}

/** Two postings are the same job when they share an id, or the same title, company and place. */
export const jobKey = (j: Pick<SavedJob["job"], "title" | "company" | "location">) =>
  `${j.title}|${j.company}|${j.location}`.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Combines saved jobs from two sources without ever creating a duplicate application.
 * When both have the job, the most recently updated copy wins.
 */
export function mergeSavedJobs(current: SavedJob[], incoming: SavedJob[]): SavedJob[] {
  const byKey = new Map<string, SavedJob>();
  const idToKey = new Map<string, string>();
  for (const item of [...current, ...incoming]) {
    const key = idToKey.get(item.job.id) ?? jobKey(item.job);
    const existing = byKey.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) byKey.set(key, item);
    idToKey.set(item.job.id, key);
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
