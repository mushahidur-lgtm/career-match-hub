import { z } from "zod";
import { jobKey } from "@/lib/backup";
import { newId } from "@/lib/ids";
import type { ApplicationStatus, Job } from "@/types/job";

/**
 * What happened to a job after it was shown. Recorded for later study only: nothing here changes a weight or
 * a score. Kept in the browser with the rest of your data and carried in backups.
 */
export const FEEDBACK_TYPES = [
  "viewed",
  "saved",
  "application_started",
  "application_submitted",
  "interview",
  "rejected",
  "offer",
  "marked_irrelevant",
  "skill_match_corrected",
  "eligibility_corrected",
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FeedbackEventSchema = z.object({
  id: z.string().max(80),
  at: z.string().max(40),
  type: z.enum(FEEDBACK_TYPES),
  jobKey: z.string().max(600),
  title: z.string().max(200),
  company: z.string().max(200),
  /** The score shown at the time, so outcomes can later be compared with it. */
  score: z.number().min(0).max(100).nullable(),
  /** For corrections: which skill or which gate was wrong. */
  detail: z.string().max(200).optional(),
});
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

export const MAX_FEEDBACK = 1000;

/** Reads a stored list one entry at a time, so one damaged entry cannot lose the rest. */
export function readFeedback(value: unknown): FeedbackEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((v) => {
    const r = FeedbackEventSchema.safeParse(v);
    return r.success ? [r.data] : [];
  }).slice(-MAX_FEEDBACK);
}

type FeedbackJob = Pick<Job, "id" | "title" | "company" | "location" | "match">;

export function recordFeedback(list: FeedbackEvent[], type: FeedbackType, job: FeedbackJob, detail?: string, now = new Date()): FeedbackEvent[] {
  const key = jobKey(job);
  const at = now.toISOString();
  // Opening the same job again the same day adds nothing.
  if (type === "viewed" && list.some((e) => e.type === type && e.jobKey === key && e.at.slice(0, 10) === at.slice(0, 10))) return list;
  const event: FeedbackEvent = {
    id: newId(),
    at,
    type,
    jobKey: key.slice(0, 600),
    title: job.title.slice(0, 200),
    company: job.company.slice(0, 200),
    score: job.match?.score ?? null,
    ...(detail ? { detail: detail.slice(0, 200) } : {}),
  };
  return [...list, event].slice(-MAX_FEEDBACK);
}

export function mergeFeedback(a: FeedbackEvent[], b: FeedbackEvent[]): FeedbackEvent[] {
  const byId = new Map([...a, ...b].map((e) => [e.id, e]));
  return [...byId.values()].sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id)).slice(-MAX_FEEDBACK);
}

/** The event a change of application status stands for, if any. */
export function feedbackForStatus(status: ApplicationStatus): FeedbackType | null {
  const map: Partial<Record<ApplicationStatus, FeedbackType>> = {
    Interested: "saved",
    "Preparing Application": "application_started",
    Applied: "application_submitted",
    Interview: "interview",
    Offer: "offer",
    Rejected: "rejected",
  };
  return map[status] ?? null;
}
