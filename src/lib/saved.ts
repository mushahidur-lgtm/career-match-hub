import { jobKey } from "@/lib/backup";
import { createApplication, moveApplication, updateApplication, type MoveOptions, type ResumeRef } from "@/lib/applications";
import type { Application, ApplicationStatus, Job, SavedJob } from "@/types/job";

/**
 * The tracked entry for a posting. A posting counts as tracked if its id matches, or if it is the
 * same employer, title and city, since the same job can come back from a search under a new id.
 */
export function findSaved(list: SavedJob[], job: Job): SavedJob | undefined {
  return list.find((s) => s.job.id === job.id) ?? list.find((s) => jobKey(s.job) === jobKey(job));
}

/** Adds a job unless the same posting is already tracked, so one posting never becomes two applications. */
export function addSavedJob(list: SavedJob[], job: Job, status: ApplicationStatus, now = new Date(), resume?: ResumeRef | null, appliedAt?: string | null): SavedJob[] {
  if (findSaved(list, job)) return list;
  return [createApplication(job, status, now, resume, appliedAt), ...list];
}

/** Runs `change` on one tracked entry. Pass `saved.job.id`, not the id of whichever listing is on screen. */
export const updateSavedJob = (list: SavedJob[], id: string, change: (a: Application) => Application): SavedJob[] =>
  list.map((s) => (s.job.id === id ? change(s) : s));

export const setSavedStatus = (list: SavedJob[], id: string, status: ApplicationStatus, now = new Date(), opts?: MoveOptions): SavedJob[] =>
  updateSavedJob(list, id, (a) => moveApplication(a, status, now, opts));

export const setSavedNotes = (list: SavedJob[], id: string, notes: string, now = new Date()): SavedJob[] =>
  updateSavedJob(list, id, (a) => updateApplication(a, { notes }, now));

export const removeSavedJob = (list: SavedJob[], id: string): SavedJob[] => list.filter((s) => s.job.id !== id);
