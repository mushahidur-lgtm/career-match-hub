import { wasSent } from "@/lib/applications";
import { jobKey } from "@/lib/backup";
import type { FeedbackEvent } from "@/lib/feedback";
import { MIN_FOR_RATE } from "@/lib/intelligence";
import { canonicalSkill } from "@/lib/skills";
import type { Application, JobCategory, SeenJob } from "@/types/job";

/**
 * Counts of what happened to jobs, from your feedback events and tracked applications. Rates appear only with
 * enough applications to mean something, and nothing here changes how jobs are scored.
 */

/** Applications and interviews needed before comparing scores with outcomes is worth anyone's time. */
export const MIN_APPLIED_FOR_REVIEW = 30;
export const MIN_INTERVIEWS_FOR_REVIEW = 8;

export interface AnalyticsInput {
  events: FeedbackEvent[];
  applications: Application[];
  seen: SeenJob[];
  /** Skills on the active profile, used to read missing skills for jobs recorded before events carried them. */
  skills: string[];
}

export interface AnalyticsFilter {
  /** Only activity in the last this-many days. Null for all time. */
  days: number | null;
  category: JobCategory | "All";
}

export interface CountRow {
  label: string;
  count: number;
}

export interface CategoryRow {
  category: string;
  reviewed: number;
  saved: number;
  applied: number;
  interviews: number;
}

export interface Analytics {
  reviewed: number;
  saved: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  irrelevant: number;
  /** Percent of applications, or null below the minimum sample. */
  interviewRate: number | null;
  offerRate: number | null;
  avgScoreApplied: { value: number | null; of: number };
  avgScoreInterview: { value: number | null; of: number };
  missingSkills: CountRow[];
  /** Jobs whose missing skills could not be known. */
  missingUnknown: number;
  correctedSkills: CountRow[];
  correctedEligibility: CountRow[];
  categories: CategoryRow[];
  review: { ready: boolean; note: string };
}

interface Record_ {
  category: string;
  at: string[];
  score: number | null;
  missing: string[] | null;
  stages: Set<"reviewed" | "saved" | "applied" | "interview" | "offer" | "rejected" | "irrelevant">;
}

const counts = (items: string[], top = 8): CountRow[] => {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, top);
};
const average = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return { value: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null, of: known.length };
};

export function computeAnalytics(input: AnalyticsInput, filter: AnalyticsFilter, now = new Date()): Analytics {
  const since = filter.days === null ? "" : new Date(now.getTime() - filter.days * 86_400_000).toISOString();
  const seen = new Map(input.seen.map((s) => [s.key, s]));
  const mine = new Set(input.skills.map((s) => canonicalSkill(s).toLowerCase()));
  const jobs = new Map<string, Record_>();
  const get = (key: string): Record_ => {
    let r = jobs.get(key);
    if (!r) {
      const known = seen.get(key);
      r = { category: known?.category ?? "Unknown", at: [], score: known?.score ?? null, missing: known ? known.required.filter((s) => !mine.has(canonicalSkill(s).toLowerCase())) : null, stages: new Set() };
      jobs.set(key, r);
    }
    return r;
  };

  for (const app of input.applications) {
    const r = get(jobKey(app.job));
    r.category = app.job.category;
    r.score = app.job.match?.score ?? r.score;
    r.missing = app.job.match?.detail?.requiredMissing ?? r.missing;
    r.at.push(app.appliedAt ?? app.savedAt, app.updatedAt);
    r.stages.add("reviewed").add("saved");
    if (wasSent(app)) r.stages.add("applied");
    if (app.status === "Interview" || app.status === "Offer" || app.interviews?.length) r.stages.add("applied").add("interview");
    if (app.status === "Offer") r.stages.add("offer");
    if (app.status === "Rejected") r.stages.add("rejected");
  }

  for (const e of [...input.events].sort((a, b) => a.at.localeCompare(b.at))) {
    const r = get(e.jobKey);
    r.at.push(e.at);
    r.stages.add("reviewed");
    // The score recorded with an event is the one shown at the time.
    if (e.score !== null) r.score = e.score;
    if (e.category && r.category === "Unknown") r.category = e.category;
    if (e.missing) r.missing = e.missing;
    if (e.type === "saved" || e.type === "application_started") r.stages.add("saved");
    if (e.type === "application_submitted") r.stages.add("applied");
    if (e.type === "interview") r.stages.add("applied").add("interview");
    if (e.type === "offer") r.stages.add("applied").add("offer");
    if (e.type === "rejected") r.stages.add("rejected");
    if (e.type === "marked_irrelevant") r.stages.add("irrelevant");
  }

  const inRange = (at: string[]) => !since || at.some((t) => t >= since.slice(0, t.length));
  const rows = [...jobs.values()].filter((r) => inRange(r.at) && (filter.category === "All" || r.category === filter.category));
  const keys = new Set([...jobs].filter(([, r]) => rows.includes(r)).map(([k]) => k));
  const stage = (name: Parameters<Record_["stages"]["has"]>[0]) => rows.filter((r) => r.stages.has(name));
  const applied = stage("applied");
  const interviews = stage("interview");
  const offers = stage("offer");
  const rate = (n: number) => (applied.length >= MIN_FOR_RATE ? Math.round((100 * n) / applied.length) : null);

  const events = input.events.filter((e) => keys.has(e.jobKey) && (!since || e.at >= since));
  const interested = rows.filter((r) => r.stages.has("saved") || r.stages.has("applied"));
  const categories = [...new Set(rows.map((r) => r.category))]
    .map((category) => {
      const own = rows.filter((r) => r.category === category);
      const n = (name: Parameters<Record_["stages"]["has"]>[0]) => own.filter((r) => r.stages.has(name)).length;
      return { category, reviewed: own.length, saved: n("saved"), applied: n("applied"), interviews: n("interview") };
    })
    .sort((a, b) => b.reviewed - a.reviewed || a.category.localeCompare(b.category));

  const ready = applied.length >= MIN_APPLIED_FOR_REVIEW && interviews.length >= MIN_INTERVIEWS_FOR_REVIEW;

  return {
    reviewed: rows.length,
    saved: stage("saved").length,
    applied: applied.length,
    interviews: interviews.length,
    offers: offers.length,
    rejected: stage("rejected").length,
    irrelevant: stage("irrelevant").length,
    interviewRate: rate(interviews.length),
    offerRate: rate(offers.length),
    avgScoreApplied: average(applied.map((r) => r.score)),
    avgScoreInterview: average(interviews.map((r) => r.score)),
    missingSkills: counts(interested.flatMap((r) => r.missing ?? [])),
    missingUnknown: interested.filter((r) => r.missing === null).length,
    correctedSkills: counts(events.filter((e) => e.type === "skill_match_corrected" && e.detail).map((e) => e.detail!)),
    correctedEligibility: counts(events.filter((e) => e.type === "eligibility_corrected").map((e) => e.detail ?? "unspecified")),
    categories,
    review: {
      ready,
      note: ready
        ? "There is now enough history to compare scores with outcomes by hand. Weights are never changed for you; change them in Settings if the comparison convinces you."
        : `Too little history to say whether the weights should change: ${applied.length} of ${MIN_APPLIED_FOR_REVIEW} applications and ${interviews.length} of ${MIN_INTERVIEWS_FOR_REVIEW} interviews.`,
    },
  };
}
