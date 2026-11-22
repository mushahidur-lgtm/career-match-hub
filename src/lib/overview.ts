import { jobKey } from "@/lib/backup";
import { yearlySalary } from "@/lib/format";
import { computeReminders, followUpsDue, isActive, isBeforeApplied, wasSent, type Reminder } from "@/lib/applications";
import type { ApplicationStatus, Job, SavedJob, StoredResults } from "@/types/job";

/** A job you could still act on, with your status for it if you track it. */
export interface Opportunity {
  job: Job;
  status: ApplicationStatus | null;
}

export interface AttentionItem extends Opportunity {
  reason: string;
  /** Lower is more urgent. */
  priority: number;
}

export interface OverviewStats {
  /** Everything from the latest search plus tracked jobs, minus rejections, counted once. */
  opportunities: Opportunity[];
  activeOpportunities: number;
  excellent: number;
  strong: number;
  /** Applied, interviewing, offer and rejected: every application that went out. */
  applicationsSent: number;
  interviews: number;
  /** Follow-ups due today or overdue. */
  followUpsDue: number;
  /** Everything due soon, most urgent first. */
  reminders: Reminder[];
  /** Interviews coming up, soonest first. */
  upcomingInterviews: Reminder[];
  best: Opportunity[];
  newlyDiscovered: Opportunity[];
  highestSalary: Opportunity[];
  attention: AttentionItem[];
  trendingSkills: { skill: string; count: number }[];
  /** How many jobs the skill counts are based on. */
  skillSampleSize: number;
}

const DAY = 86_400_000;

const daysBetween = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(from)) / DAY));

export function computeOverview(results: StoredResults | null, saved: SavedJob[], now = new Date()): OverviewStats {
  const byKey = new Map<string, Opportunity>();
  const statusOf = new Map(saved.map((s) => [jobKey(s.job), s.status]));

  // Saved jobs first, so a tracked job keeps its status; then fresher search results replace its match.
  for (const s of saved) byKey.set(jobKey(s.job), { job: s.job, status: s.status });
  for (const job of results?.jobs ?? []) {
    const key = jobKey(job);
    byKey.set(key, { job, status: statusOf.get(key) ?? null });
  }

  const all = [...byKey.values()];
  const opportunities = all.filter((o) => o.status === null || isActive(o.status));
  const score = (o: Opportunity) => o.job.match?.score ?? -1;

  const open = (o: Opportunity) => o.status === null || isBeforeApplied(o.status);
  const best = opportunities.filter((o) => open(o) && o.job.match).sort((a, b) => score(b) - score(a)).slice(0, 5);

  const newlyDiscovered = (results?.jobs ?? [])
    .filter((j) => j.postedAt && now.getTime() - Date.parse(j.postedAt) <= 7 * DAY && Date.parse(j.postedAt) <= now.getTime() + DAY)
    .sort((a, b) => Date.parse(b.postedAt!) - Date.parse(a.postedAt!))
    .slice(0, 5)
    .map((job) => ({ job, status: statusOf.get(jobKey(job)) ?? null }));

  const highestSalary = opportunities
    .filter((o) => o.job.salary && !o.job.salary.estimated && yearlySalary(o.job) !== null)
    .sort((a, b) => yearlySalary(b.job)! - yearlySalary(a.job)!)
    .slice(0, 5);

  const attention: AttentionItem[] = [];
  for (const s of saved) {
    const idle = daysBetween(s.updatedAt, now);
    const o: Opportunity = { job: s.job, status: s.status };
    if (s.status === "Offer") attention.push({ ...o, reason: "You have an offer. Decide and reply.", priority: 0 });
    else if (s.status === "Interview" && idle >= 5) attention.push({ ...o, reason: `Interview stage with no update for ${idle} days.`, priority: 1 });
    else if (s.status === "Applied" && idle >= 7) attention.push({ ...o, reason: `Applied ${idle} days ago with no update. A follow-up may be due.`, priority: 2 });
    else if (isBeforeApplied(s.status) && (s.job.match?.score ?? 0) >= 90 && daysBetween(s.savedAt, now) >= 2) {
      attention.push({ ...o, reason: "An excellent match you have saved but not applied to.", priority: 3 });
    }
  }
  attention.sort((a, b) => a.priority - b.priority);

  const reminders = computeReminders(saved, now);

  const counts = new Map<string, number>();
  let sample = 0;
  for (const o of opportunities) {
    const d = o.job.match?.detail;
    if (!d) continue;
    sample++;
    const skills = new Set([...d.requiredMatched, ...d.requiredMissing, ...d.transferable.map((t) => t.skill)]);
    for (const skill of skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
  }
  const trendingSkills = [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, 10);

  return {
    opportunities,
    activeOpportunities: opportunities.length,
    excellent: opportunities.filter((o) => score(o) >= 90).length,
    strong: opportunities.filter((o) => score(o) >= 70 && score(o) < 90).length,
    applicationsSent: saved.filter((a) => wasSent(a)).length,
    interviews: saved.filter((a) => a.status === "Interview").length,
    followUpsDue: followUpsDue(reminders).length,
    reminders,
    upcomingInterviews: reminders.filter((r) => r.kind === "interview"),
    best,
    newlyDiscovered,
    highestSalary,
    attention: attention.slice(0, 6),
    trendingSkills,
    skillSampleSize: sample,
  };
}
