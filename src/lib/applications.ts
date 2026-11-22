import { newId } from "@/lib/ids";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type ActivityEntry,
  type ActivityKind,
  type Application,
  type ApplicationStatus,
  type Interview,
  type Job,
} from "@/types/job";

/* ---------- dates ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as "YYYY-MM-DD" in the local time zone. */
export const todayLocal = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** A "YYYY-MM-DD" date as a local midnight, or null if it is not a real date. */
export function parseDay(day: string | null | undefined): Date | null {
  const m = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

/** "YYYY-MM-DDTHH:mm" as a local date and time, or null. */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  const day = m ? parseDay(m[1]) : null;
  if (!m || !day) return null;
  day.setHours(Number(m[2]), Number(m[3]));
  return day;
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  if (!d) return day;
  d.setDate(d.getDate() + n);
  return todayLocal(d);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/* ---------- stages ---------- */

export const isOutcome = (s: ApplicationStatus) => (APPLICATION_OUTCOMES as readonly string[]).includes(s);
export const isActive = (s: ApplicationStatus) => !isOutcome(s);
/** True for New, Interested and Preparing Application: not yet sent. */
export const isBeforeApplied = (s: ApplicationStatus) => isActive(s) && stageIndex(s) < stageIndex("Applied");
const stageIndex = (s: ApplicationStatus) => (APPLICATION_STAGES as readonly string[]).indexOf(s);

/** Moving into one of these means the application has gone out. */
const SENDING: ApplicationStatus[] = ["Applied", "Interview", "Offer"];

/** An application has been sent if it has an application date, or has reached a sent stage. */
export const wasSent = (a: Pick<Application, "status" | "appliedAt">) => Boolean(a.appliedAt) || SENDING.includes(a.status) || a.status === "Rejected";

export const DEFAULT_FOLLOW_UP_DAYS = 7;
const MAX_HISTORY = 500;

/* ---------- history ---------- */

export function activity(kind: ActivityKind, text: string, now = new Date()): ActivityEntry {
  return { id: newId(), at: now.toISOString(), kind, text: text.slice(0, 2000) };
}

const withHistory = (a: Application, entries: ActivityEntry[]): Application =>
  entries.length ? { ...a, history: [...(a.history ?? []), ...entries].slice(-MAX_HISTORY) } : a;

/* ---------- creating and moving ---------- */

export interface ResumeRef {
  id: string;
  name: string;
}

export function createApplication(job: Job, status: ApplicationStatus = "Interested", now = new Date(), resume?: ResumeRef | null): Application {
  const at = now.toISOString();
  const sent = SENDING.includes(status);
  return {
    job,
    status,
    notes: "",
    savedAt: at,
    updatedAt: at,
    appliedAt: sent ? todayLocal(now) : null,
    resumeVersionId: sent && resume ? resume.id : null,
    resumeName: sent && resume ? resume.name : null,
    followUpDate: status === "Applied" ? addDays(todayLocal(now), DEFAULT_FOLLOW_UP_DAYS) : null,
    history: [activity("created", `Added as ${status}.`, now)],
  };
}

export interface MoveOptions {
  /** The resume version in use, recorded the first time the application goes out. */
  resume?: ResumeRef | null;
  rejectionReason?: string;
}

/**
 * Moves an application to another stage and records why things changed with it. Any move is
 * allowed, since real searches skip stages and reopen. Going out sets the application date once,
 * records the resume version used, and suggests a follow-up a week later.
 */
export function moveApplication(app: Application, to: ApplicationStatus, now = new Date(), opts: MoveOptions = {}): Application {
  if (app.status === to) return app;
  const from = app.status;
  const entries: ActivityEntry[] = [];
  let next: Application = { ...app, status: to, updatedAt: now.toISOString() };

  const reopened = isOutcome(from) && isActive(to);
  entries.push(activity("status", reopened ? `Reopened: moved from ${from} to ${to}.` : `Moved from ${from} to ${to}.`, now));

  // Only the first time it goes out. A job that was already applied to, such as one saved before dates
  // were recorded, keeps an unknown date rather than being given today's.
  const firstSend = SENDING.includes(to) && !wasSent(app);
  if (firstSend && !app.appliedAt) {
    const today = todayLocal(now);
    next = { ...next, appliedAt: today };
    entries.push(activity("edit", `Application date set to ${today}.`, now));
  }
  if (firstSend && opts.resume && !app.resumeVersionId) {
    next = { ...next, resumeVersionId: opts.resume.id, resumeName: opts.resume.name };
    entries.push(activity("edit", `Resume used: ${opts.resume.name}.`, now));
  }
  if (to === "Applied" && !app.followUpDate) {
    const when = addDays(todayLocal(now), DEFAULT_FOLLOW_UP_DAYS);
    next = { ...next, followUpDate: when };
    entries.push(activity("edit", `Follow-up set for ${when}.`, now));
  }
  if (to === "Rejected" && opts.rejectionReason?.trim()) {
    const reason = opts.rejectionReason.trim().slice(0, 2000);
    next = { ...next, rejectionReason: reason };
    entries.push(activity("note", `Reason given: ${reason}`, now));
  }
  return withHistory(next, entries);
}

/* ---------- editing ---------- */

const DATE_FIELDS: { key: "followUpDate" | "deadline" | "responseDue" | "appliedAt"; label: string }[] = [
  { key: "followUpDate", label: "Follow-up" },
  { key: "deadline", label: "Application deadline" },
  { key: "responseDue", label: "Expected response" },
  { key: "appliedAt", label: "Application date" },
];

/**
 * Applies edits. Changes to dates are written to the history, because they drive reminders.
 * Text you type (notes, cover letter, contacts) is not logged keystroke by keystroke.
 */
export function updateApplication(app: Application, patch: Partial<Application>, now = new Date()): Application {
  const next: Application = { ...app, ...patch, updatedAt: now.toISOString() };
  const entries: ActivityEntry[] = [];
  for (const { key, label } of DATE_FIELDS) {
    if (key in patch && (patch[key] ?? null) !== (app[key] ?? null)) {
      entries.push(activity("edit", patch[key] ? `${label} set to ${patch[key]}.` : `${label} cleared.`, now));
    }
  }
  if (patch.offer && patch.offer.decideBy !== (app.offer?.decideBy ?? null)) {
    entries.push(activity("edit", patch.offer.decideBy ? `Offer decision date set to ${patch.offer.decideBy}.` : "Offer decision date cleared.", now));
  }
  if (patch.offer && patch.offer.salary.trim() && !app.offer?.salary.trim()) {
    entries.push(activity("edit", "Offer details recorded.", now));
  }
  if (patch.resumeVersionId !== undefined && patch.resumeVersionId !== (app.resumeVersionId ?? null) && patch.resumeName) {
    entries.push(activity("edit", `Resume used: ${patch.resumeName}.`, now));
  }
  return withHistory(next, entries);
}

export function addNote(app: Application, text: string, now = new Date()): Application {
  const t = text.trim();
  return t ? withHistory({ ...app, updatedAt: now.toISOString() }, [activity("note", t, now)]) : app;
}

/** Records a conversation: a call, an email, a message from the recruiter. */
export function logContact(app: Application, text: string, now = new Date()): Application {
  const t = text.trim();
  return t ? withHistory({ ...app, updatedAt: now.toISOString() }, [activity("contact", t, now)]) : app;
}

export function removeHistoryEntry(app: Application, id: string): Application {
  return { ...app, history: (app.history ?? []).filter((h) => h.id !== id) };
}

/* ---------- interviews ---------- */

export function newInterview(over: Partial<Interview> = {}): Interview {
  return {
    id: newId(),
    at: null,
    stage: "Recruiter screen",
    format: "Video",
    status: "Scheduled",
    interviewers: "",
    prepNotes: "",
    questionsToAsk: [],
    topicsToReview: [],
    feedback: "",
    ...over,
  };
}

const describeInterview = (i: Interview) => `${i.stage} interview, ${i.format.toLowerCase()}${i.at ? ` on ${i.at.replace("T", " at ")}` : ", time not set"}`;

/** Adds an interview. If the application had not reached the interview stage yet, it moves there. */
export function addInterview(app: Application, interview: Interview, now = new Date(), resume?: ResumeRef | null): Application {
  let next: Application = withHistory({ ...app, interviews: [...(app.interviews ?? []), interview], updatedAt: now.toISOString() }, [
    activity("interview", `Added: ${describeInterview(interview)}.`, now),
  ]);
  if (isActive(next.status) && stageIndex(next.status) < stageIndex("Interview")) next = moveApplication(next, "Interview", now, { resume });
  return next;
}

export function updateInterview(app: Application, id: string, patch: Partial<Interview>, now = new Date()): Application {
  const before = (app.interviews ?? []).find((i) => i.id === id);
  if (!before) return app;
  const after = { ...before, ...patch };
  const entries: ActivityEntry[] = [];
  if (patch.at !== undefined && patch.at !== before.at) entries.push(activity("interview", after.at ? `Rescheduled: ${describeInterview(after)}.` : `Time cleared for the ${before.stage} interview.`, now));
  if (patch.status && patch.status !== before.status) entries.push(activity("interview", `${before.stage} interview marked ${patch.status.toLowerCase()}.`, now));
  if (patch.feedback !== undefined && !before.feedback.trim() && patch.feedback.trim()) entries.push(activity("interview", `Feedback recorded for the ${before.stage} interview.`, now));
  return withHistory({ ...app, interviews: (app.interviews ?? []).map((i) => (i.id === id ? after : i)), updatedAt: now.toISOString() }, entries);
}

export function removeInterview(app: Application, id: string, now = new Date()): Application {
  const before = (app.interviews ?? []).find((i) => i.id === id);
  if (!before) return app;
  return withHistory({ ...app, interviews: (app.interviews ?? []).filter((i) => i.id !== id), updatedAt: now.toISOString() }, [
    activity("interview", `Removed: ${describeInterview(before)}.`, now),
  ]);
}

/** The next scheduled interview that has not happened yet. */
export function nextInterview(app: Application, now = new Date()): Interview | null {
  const upcoming = (app.interviews ?? [])
    .filter((i) => i.status === "Scheduled")
    .map((i) => ({ i, when: parseLocalDateTime(i.at) }))
    .filter((x): x is { i: Interview; when: Date } => x.when !== null && x.when.getTime() >= now.getTime())
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  return upcoming[0]?.i ?? null;
}

/* ---------- reminders ---------- */

export type ReminderKind = "follow-up" | "interview" | "deadline" | "response" | "offer";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  app: Application;
  /** The date it concerns, "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" for an interview. */
  date: string;
  label: string;
  /** "Overdue by 3 days", "Today", "Tomorrow", "In 4 days". */
  when: string;
  overdue: boolean;
  /** Negative when overdue. */
  daysAway: number;
}

const whenText = (days: number) => (days < 0 ? `Overdue by ${-days} ${days === -1 ? "day" : "days"}` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

export const REMINDER_HORIZON_DAYS = 7;

/**
 * What needs doing, from the dates you have set. Follow-ups, interviews, deadlines, expected
 * replies and offer decisions that are overdue or within the next week, most urgent first.
 * Finished applications (rejected, withdrawn, closed) never produce reminders.
 */
export function computeReminders(apps: Application[], now = new Date(), horizon = REMINDER_HORIZON_DAYS): Reminder[] {
  const today = todayLocal(now);
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, "when" | "overdue" | "daysAway" | "id"> & { days: number }) => {
    if (r.days > horizon) return;
    const { days, ...rest } = r;
    out.push({ ...rest, id: `${rest.kind}:${rest.app.job.id}:${rest.date}`, when: whenText(days), overdue: days < 0, daysAway: days });
  };

  for (const app of apps) {
    if (!isActive(app.status)) continue;
    const label = `${app.job.title} at ${app.job.company}`;

    if (app.followUpDate && parseDay(app.followUpDate)) {
      push({ kind: "follow-up", app, date: app.followUpDate, label: `Follow up: ${label}`, days: daysBetween(today, app.followUpDate) });
    }
    if (app.deadline && parseDay(app.deadline) && stageIndex(app.status) < stageIndex("Applied")) {
      push({ kind: "deadline", app, date: app.deadline, label: `Application deadline: ${label}`, days: daysBetween(today, app.deadline) });
    }
    if (app.responseDue && parseDay(app.responseDue) && (app.status === "Applied" || app.status === "Interview")) {
      push({ kind: "response", app, date: app.responseDue, label: `Expected reply: ${label}`, days: daysBetween(today, app.responseDue) });
    }
    if (app.status === "Offer" && app.offer?.decideBy && parseDay(app.offer.decideBy)) {
      push({ kind: "offer", app, date: app.offer.decideBy, label: `Offer decision due: ${label}`, days: daysBetween(today, app.offer.decideBy) });
    }
    for (const iv of app.interviews ?? []) {
      const when = parseLocalDateTime(iv.at);
      if (iv.status !== "Scheduled" || !when || !iv.at) continue;
      // A scheduled interview whose time has passed is flagged, so you record how it went.
      const days = daysBetween(today, iv.at.slice(0, 10));
      const passed = when.getTime() < now.getTime();
      push({
        kind: "interview",
        app,
        date: iv.at,
        label: `${passed ? "Record how it went: " : ""}${iv.stage} interview, ${label}`,
        days: passed && days === 0 ? -0.5 : days,
      });
    }
  }

  return out
    .map((r) => (r.daysAway === -0.5 ? { ...r, daysAway: 0, overdue: true, when: "Earlier today" } : r))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysAway - b.daysAway || a.date.localeCompare(b.date));
}

/** Follow-ups that are due today or overdue. */
export const followUpsDue = (reminders: Reminder[]) => reminders.filter((r) => r.kind === "follow-up" && r.daysAway <= 0);
