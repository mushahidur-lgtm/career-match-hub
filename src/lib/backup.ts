import { z } from "zod";
import type { IntelStore, ResumeVersion, SavedJob, SearchFilters, SearchPreferences } from "@/types/job";
import {
  FiltersSchema,
  PreferencesSchema,
  ProfileSchema,
  ResumeSchema,
  ResumeVersionsSchema,
  SavedJobsSchema,
} from "./schemas";
import { duplicateKey } from "./dedupe";
import { readIntel } from "./history-load";
import { LEGACY_VERSION_ID, nameFromFile } from "./storage";

export const BACKUP_APP = "career-match-hub";
export const BACKUP_VERSION = 3;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface AppData {
  resumes: ResumeVersion[];
  activeResumeId: string | null;
  filters: SearchFilters;
  preferences: SearchPreferences;
  saved: SavedJob[];
  /** Search history. Absent in backups made before it existed. */
  intel?: IntelStore;
}

const DataV2 = z.object({
  resumes: ResumeVersionsSchema,
  activeResumeId: z.string().max(80).nullable(),
  filters: FiltersSchema,
  preferences: PreferencesSchema,
  saved: SavedJobsSchema,
  // Checked entry by entry afterwards, so one damaged history entry cannot reject the whole backup.
  intel: z.unknown().optional(),
});

/** Backups made before resume versions existed held a single resume and profile. */
const DataV1 = z.object({
  resume: ResumeSchema.nullable(),
  profile: ProfileSchema.nullable(),
  filters: FiltersSchema,
  preferences: PreferencesSchema,
  saved: SavedJobsSchema,
});

const Envelope = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.unknown(),
});

export function buildBackup(data: AppData, now = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

export type ParsedBackup = { ok: true; data: AppData; exportedAt: string } | { ok: false; error: string };

const damaged = (issue?: z.core.$ZodIssue): ParsedBackup => ({
  ok: false,
  error: `That is not a Career Match Hub backup, or it is damaged${issue?.path.length ? ` (${issue.path.join(".")})` : ""}.`,
});

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: "That file is too large to be a Career Match Hub backup." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const env = Envelope.safeParse(json);
  if (!env.success) return damaged(env.error.issues[0]);

  if (env.data.version >= 2) {
    // Versions 2 and 3 share a shape. Version 3 adds application fields; older status names are read as the new ones.
    const d = DataV2.safeParse(env.data.data);
    if (!d.success) return damaged(d.error.issues[0]);
    const { intel: rawIntel, ...rest } = d.data;
    const intel = rawIntel === undefined ? undefined : readIntel(rawIntel)?.store;
    return { ok: true, data: { ...(rest as Omit<AppData, "intel">), ...(intel ? { intel } : {}) }, exportedAt: env.data.exportedAt };
  }

  const d = DataV1.safeParse(env.data.data);
  if (!d.success) return damaged(d.error.issues[0]);
  const { resume, profile } = d.data;
  const resumes: ResumeVersion[] =
    resume && profile
      ? [{ id: LEGACY_VERSION_ID, name: nameFromFile(resume.fileName, "My resume"), text: resume.text, fileName: resume.fileName, uploadedAt: resume.uploadedAt, profile }]
      : [];
  return {
    ok: true,
    exportedAt: env.data.exportedAt,
    data: { resumes, activeResumeId: resumes[0]?.id ?? null, filters: d.data.filters, preferences: d.data.preferences, saved: d.data.saved as SavedJob[] },
  };
}

/**
 * Identity of a posting. The same employer, title and city is the same job even when the board
 * words it differently ("Acme Inc." and "Acme", "Data Engineer (Hybrid)" and "Data Engineer").
 * A job whose employer is unknown is identified by its id alone, so unrelated jobs never collide.
 */
export const jobKey = (j: Pick<SavedJob["job"], "id" | "title" | "company" | "location">) => duplicateKey(j) ?? `id:${j.id}`;

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

/** Adds resume versions from a backup that you do not already have, by id or identical text. */
export function mergeResumes(current: ResumeVersion[], incoming: ResumeVersion[], max = 20): ResumeVersion[] {
  const out = [...current];
  const ids = new Set(current.map((r) => r.id));
  const texts = new Set(current.map((r) => r.text.trim()));
  for (const r of incoming) {
    if (out.length >= max) break;
    if (ids.has(r.id) || texts.has(r.text.trim())) continue;
    out.push(r);
    ids.add(r.id);
    texts.add(r.text.trim());
  }
  return out;
}
