import { wasSent } from "@/lib/applications";
import { titleSimilarity } from "@/lib/matching/engine";
import { canonicalSkill } from "@/lib/skills";
import { APPLICATION_STATUSES, type Application, type ApplicationStatus, type SearchRecord, type SeenJob } from "@/types/job";

/**
 * Everything here is counted from jobs your searches returned and applications you tracked.
 * It describes what you have seen, not the whole job market, and nothing is estimated or invented.
 */

export const SUITABLE_MIN = 70;
export const RELEVANT_MIN = 60;
/** Below this many applications sent, a conversion rate would mislead, so the counts are shown instead. */
export const MIN_FOR_RATE = 5;
export const DAYS_SHOWN = 30;

export interface Count {
  label: string;
  value: number;
}

export interface SkillRow {
  skill: string;
  jobs: number;
  /** Share of the jobs in this view that ask for it, 0 to 100. */
  share: number;
  have: boolean;
}

export interface RoleRow {
  role: string;
  jobs: number;
  suitable: number;
  avgScore: number | null;
  scored: number;
  medianPay: number | null;
  payStated: number;
  /** Of the jobs that state a work arrangement, the share that are remote or hybrid. */
  flexibleShare: number | null;
  topMissing: string | null;
}

export interface Intelligence {
  /** Jobs in this view, after leaving out demo data unless asked. */
  jobs: number;
  searches: number;
  firstSeen: string | null;
  hasScores: boolean;
  discoveredByDay: { day: string; value: number }[];
  scoreByDay: { day: string; value: number | null }[];
  averageScore: number | null;
  locations: Count[];
  salaryBands: Count[];
  salaryStated: number;
  arrangement: Count[];
  employment: Count[];
  skills: SkillRow[];
  gaps: SkillRow[];
  /** Share of jobs whose text was cut short by the provider, which makes every skill count a minimum. */
  truncatedShare: number;
  companies: { company: string; jobs: number; best: number }[];
  relevantJobs: number;
  applicationsByStatus: Count[];
  funnel: { tracked: number; sent: number; interviewed: number; offers: number; enough: boolean; rate: number | null };
  roles: RoleRow[];
  demoObserved: number;
}

export interface IntelligenceInput {
  history: SearchRecord[];
  seen: SeenJob[];
  applications: Application[];
  /** Skills on the active resume. */
  profileSkills: string[];
  /** The roles you are targeting, used for the comparison. */
  roles: string[];
  now?: Date;
  includeDemo?: boolean;
}

const GTA = new Set([
  "toronto", "mississauga", "brampton", "markham", "vaughan", "richmond hill", "oakville", "burlington", "pickering", "ajax", "whitby", "oshawa",
  "etobicoke", "scarborough", "north york", "milton", "newmarket", "aurora", "stouffville", "caledon", "halton hills", "king", "clarington", "greater toronto area",
]);

/** "Kanata, ON" and "Ottawa, ON" are one place for a job search; the GTA's towns are one too. */
export function placeOf(location: string): string {
  const first = location.split(",")[0].trim();
  if (!first) return "Not stated";
  const lower = first.toLowerCase();
  if (/\bremote\b/.test(location.toLowerCase())) return "Remote";
  if (GTA.has(lower)) return "Greater Toronto Area";
  if (["kanata", "nepean", "orleans", "barrhaven", "stittsville"].includes(lower)) return "Ottawa";
  if (/^(canada|ontario|on)$/.test(lower)) return "Canada (no city)";
  return first.replace(/\b\w/g, (c) => c.toUpperCase());
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The local calendar day of a stored timestamp, or null when it is not a date. */
export const dayOf = (iso: string): string | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : localDay(d);
};

const lastDays = (n: number, now: Date): string[] => {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12)));
  return out;
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const tally = (items: string[]): Count[] => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
};

const BANDS: [string, number, number][] = [
  ["Under $80k", 0, 80_000],
  ["$80k to $100k", 80_000, 100_000],
  ["$100k to $120k", 100_000, 120_000],
  ["$120k to $140k", 120_000, 140_000],
  ["$140k to $160k", 140_000, 160_000],
  ["$160k or more", 160_000, Infinity],
];

const bandOf = (pay: { lo: number; hi: number }) => {
  const mid = (pay.lo + pay.hi) / 2;
  return BANDS.find(([, lo, hi]) => mid >= lo && mid < hi)![0];
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function skillRows(jobs: SeenJob[], have: Set<string>, pick: (j: SeenJob) => string[]): SkillRow[] {
  const counts = new Map<string, { name: string; jobs: number }>();
  for (const j of jobs) {
    const seen = new Set<string>();
    for (const raw of pick(j)) {
      const k = canonicalSkill(raw).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const c = counts.get(k);
      if (c) c.jobs += 1;
      else counts.set(k, { name: canonicalSkill(raw), jobs: 1 });
    }
  }
  return [...counts.entries()]
    .map(([k, c]) => ({ skill: c.name, jobs: c.jobs, share: pct(c.jobs, jobs.length), have: have.has(k) }))
    .sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill));
}

export function computeIntelligence(input: IntelligenceInput): Intelligence {
  const now = input.now ?? new Date();
  const includeDemo = input.includeDemo ?? false;
  const all = input.seen;
  const jobs = includeDemo ? all : all.filter((j) => j.source !== "demo");
  const history = includeDemo ? input.history : input.history.filter((h) => h.provider !== "demo");
  const have = new Set(input.profileSkills.map((s) => canonicalSkill(s).toLowerCase()));
  const scored = jobs.filter((j) => j.score !== null);

  const days = lastDays(DAYS_SHOWN, now);
  const byDay = new Map<string, number>(days.map((d) => [d, 0]));
  for (const j of jobs) {
    const d = dayOf(j.firstSeenAt);
    if (d && byDay.has(d)) byDay.set(d, byDay.get(d)! + 1);
  }
  const scoreAcc = new Map<string, { sum: number; n: number }>();
  for (const h of history) {
    const d = dayOf(h.at);
    if (!d || !byDay.has(d) || h.avgScore === null || h.scoredCount === 0) continue;
    const a = scoreAcc.get(d) ?? { sum: 0, n: 0 };
    a.sum += h.avgScore * h.scoredCount;
    a.n += h.scoredCount;
    scoreAcc.set(d, a);
  }

  const places = tally(jobs.map((j) => placeOf(j.location)));
  const locations = places.length > 9 ? [...places.slice(0, 8), { label: "All other places", value: places.slice(8).reduce((n, p) => n + p.value, 0) }] : places;

  const paid = jobs.filter((j) => j.pay);
  const bandCounts = new Map<string, number>(BANDS.map(([l]) => [l, 0]));
  for (const j of paid) bandCounts.set(bandOf(j.pay!), bandCounts.get(bandOf(j.pay!))! + 1);

  const required = skillRows(jobs, have, (j) => j.required);
  const everything = skillRows(jobs, have, (j) => [...j.required, ...j.preferred]);

  const relevant = jobs.filter((j) => (j.score ?? -1) >= RELEVANT_MIN);
  const companyMap = new Map<string, { company: string; jobs: number; best: number }>();
  for (const j of relevant) {
    if (!j.company.trim() || /^company not listed$/i.test(j.company.trim())) continue;
    const k = j.company.trim().toLowerCase();
    const c = companyMap.get(k) ?? { company: j.company.trim(), jobs: 0, best: 0 };
    c.jobs += 1;
    c.best = Math.max(c.best, j.score ?? 0);
    companyMap.set(k, c);
  }

  const apps = input.applications;
  const statusCounts = new Map<ApplicationStatus, number>(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const a of apps) statusCounts.set(a.status, statusCounts.get(a.status)! + 1);
  const sent = apps.filter((a) => wasSent(a));
  const interviewed = sent.filter((a) => a.status === "Interview" || a.status === "Offer" || (a.interviews ?? []).some((i) => i.status !== "Cancelled"));
  const offers = sent.filter((a) => a.status === "Offer" || Boolean(a.offer));

  const roles: RoleRow[] = input.roles.map((role) => {
    const mine = jobs.filter((j) => titleSimilarity(j.title, [role]) >= 0.99);
    const sc = mine.filter((j) => j.score !== null);
    const pay = mine.flatMap((j) => (j.pay ? [(j.pay.lo + j.pay.hi) / 2] : []));
    const stated = mine.filter((j) => j.workMode !== "Not stated");
    const missing = skillRows(mine, have, (j) => j.required).filter((s) => !s.have);
    return {
      role,
      jobs: mine.length,
      suitable: sc.filter((j) => j.score! >= SUITABLE_MIN).length,
      avgScore: sc.length ? Math.round(sc.reduce((n, j) => n + j.score!, 0) / sc.length) : null,
      scored: sc.length,
      medianPay: median(pay),
      payStated: pay.length,
      flexibleShare: stated.length ? pct(stated.filter((j) => j.workMode !== "On-site").length, stated.length) : null,
      topMissing: missing[0]?.skill ?? null,
    };
  });

  return {
    jobs: jobs.length,
    searches: history.length,
    firstSeen: jobs.length ? jobs.reduce((a, j) => (j.firstSeenAt < a ? j.firstSeenAt : a), jobs[0].firstSeenAt) : null,
    hasScores: scored.length > 0,
    discoveredByDay: days.map((d) => ({ day: d, value: byDay.get(d)! })),
    scoreByDay: days.map((d) => {
      const a = scoreAcc.get(d);
      return { day: d, value: a ? Math.round((a.sum / a.n) * 10) / 10 : null };
    }),
    averageScore: scored.length ? Math.round((scored.reduce((n, j) => n + j.score!, 0) / scored.length) * 10) / 10 : null,
    locations,
    salaryBands: BANDS.map(([label]) => ({ label, value: bandCounts.get(label)! })),
    salaryStated: paid.length,
    arrangement: tally(jobs.map((j) => j.workMode)),
    employment: tally(jobs.map((j) => j.employmentType)),
    skills: everything.slice(0, 15),
    gaps: required.filter((s) => !s.have).slice(0, 10),
    truncatedShare: pct(jobs.filter((j) => j.truncated).length, jobs.length),
    companies: [...companyMap.values()].sort((a, b) => b.jobs - a.jobs || b.best - a.best).slice(0, 10),
    relevantJobs: relevant.length,
    applicationsByStatus: APPLICATION_STATUSES.map((s) => ({ label: s, value: statusCounts.get(s)! })),
    funnel: {
      tracked: apps.length,
      sent: sent.length,
      interviewed: interviewed.length,
      offers: offers.length,
      enough: sent.length >= MIN_FOR_RATE,
      rate: sent.length >= MIN_FOR_RATE ? pct(interviewed.length, sent.length) : null,
    },
    roles,
    demoObserved: all.filter((j) => j.source === "demo").length,
  };
}
