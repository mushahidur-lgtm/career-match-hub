import { jobKey } from "@/lib/backup";
import type { ApplicationStatus, Job, SavedJob } from "@/types/job";

/**
 * The tracked entry for a posting. A posting counts as tracked if its id matches, or if it is the
 * same employer, title and city, since the same job can come back from a search under a new id.
 */
export function findSaved(list: SavedJob[], job: Job): SavedJob | undefined {
  return list.find((s) => s.job.id === job.id) ?? list.find((s) => jobKey(s.job) === jobKey(job));
}

/** Adds a job unless the same posting is already tracked, so one posting never becomes two applications. */
export function addSavedJob(list: SavedJob[], job: Job, status: ApplicationStatus, now = new Date()): SavedJob[] {
  if (findSaved(list, job)) return list;
  const at = now.toISOString();
  return [{ job, status, notes: "", savedAt: at, updatedAt: at }, ...list];
}

/** These act on the tracked entry's own id: pass `saved.job.id`, not the id of whichever listing is on screen. */
export const setSavedStatus = (list: SavedJob[], id: string, status: ApplicationStatus, now = new Date()): SavedJob[] =>
  list.map((s) => (s.job.id === id ? { ...s, status, updatedAt: now.toISOString() } : s));

export const setSavedNotes = (list: SavedJob[], id: string, notes: string, now = new Date()): SavedJob[] =>
  list.map((s) => (s.job.id === id ? { ...s, notes, updatedAt: now.toISOString() } : s));

export const removeSavedJob = (list: SavedJob[], id: string): SavedJob[] => list.filter((s) => s.job.id !== id);
