import { z } from "zod";
import { yearlySalary } from "@/lib/format";
import { freshness, levelBucket, LEVEL_BUCKETS, type LevelBucket } from "@/lib/job-meta";
import { likelyClosed } from "@/lib/job-quality";
import { employmentMatches } from "@/lib/providers/common";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_FILTERS,
  JOB_CATEGORIES,
  WORK_MODES,
  legacyStatus,
  type ApplicationStatus,
  type EmploymentTypeFilter,
  type Job,
  type JobCategoryFilter,
  type WorkModeFilter,
} from "@/types/job";

/** Narrows the jobs already found. The search form asks the job board; these filters work on what came back. */
export interface RefineFilters {
  /** Lowest match score to show. 0 shows everything. */
  minScore: number;
  /** Yearly salary range in CAD. */
  salaryMin: number | null;
  salaryMax: number | null;
  /** Keep jobs that state no salary, or only an estimated one. */
  includeUnknownSalary: boolean;
  location: string;
  workMode: WorkModeFilter;
  employmentType: EmploymentTypeFilter;
  category: JobCategoryFilter;
  seniority: "All" | LevelBucket;
  /** Posted within this many days. 0 means any time. Jobs with no posting date do not pass a limit. */
  postedWithinDays: 0 | 1 | 3 | 7 | 30;
  hideStale: boolean;
  company: string;
  title: string;
  status: "All" | "Not tracked" | ApplicationStatus;
  /** "strong": the engine's strong matches. */
  strongOnly: boolean;
  verifiedOnly: boolean;
  eligibility: "All" | "eligible" | "needs_verification" | "not_applicable";
  requiredSkills: "All" | "none_missing" | "some_missing";
  transitionOnly: boolean;
}

export const DEFAULT_REFINE: RefineFilters = {
  minScore: 0,
  salaryMin: null,
  salaryMax: null,
  includeUnknownSalary: true,
  location: "",
  workMode: "All",
  employmentType: "All",
  category: "All",
  seniority: "All",
  postedWithinDays: 0,
  hideStale: false,
  company: "",
  title: "",
  status: "All",
  strongOnly: false,
  verifiedOnly: false,
  eligibility: "All",
  requiredSkills: "All",
  transitionOnly: false,
};

export const RefineSchema = z.object({
  minScore: z.number().min(0).max(100),
  salaryMin: z.number().min(0).max(10_000_000).nullable(),
  salaryMax: z.number().min(0).max(10_000_000).nullable(),
  includeUnknownSalary: z.boolean(),
  location: z.string().max(100),
  workMode: z.enum(["All", ...WORK_MODES]),
  employmentType: z.enum(EMPLOYMENT_FILTERS),
  category: z.enum(["All", ...JOB_CATEGORIES]),
  seniority: z.enum(["All", ...LEVEL_BUCKETS]),
  postedWithinDays: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7), z.literal(30)]),
  hideStale: z.boolean(),
  company: z.string().max(100),
  title: z.string().max(100),
  // Filters saved before the pipeline grew may hold an old status name.
  status: z.preprocess(legacyStatus, z.enum(["All", "Not tracked", ...APPLICATION_STATUSES])),
  // Filters saved before these existed read as off.
  strongOnly: z.boolean().default(false),
  verifiedOnly: z.boolean().default(false),
  eligibility: z.enum(["All", "eligible", "needs_verification", "not_applicable"]).default("All"),
  requiredSkills: z.enum(["All", "none_missing", "some_missing"]).default("All"),
  transitionOnly: z.boolean().default(false),
});

export interface RefineContext {
  /** Your status for a job, if you track it. */
  statusOf: (job: Job) => ApplicationStatus | null;
  now?: Date;
}

const has = (haystack: string, needle: string) => !needle.trim() || haystack.toLowerCase().includes(needle.trim().toLowerCase());

export function refineJobs(jobs: Job[], f: RefineFilters, ctx: RefineContext): Job[] {
  const now = ctx.now ?? new Date();
  return jobs.filter((job) => {
    if (f.minScore > 0 && (job.match?.score ?? -1) < f.minScore) return false;

    if (f.salaryMin !== null || f.salaryMax !== null) {
      const stated = job.salary && !job.salary.estimated ? job.salary : null;
      if (!stated) {
        if (!f.includeUnknownSalary) return false;
      } else {
        // The job's range must overlap the range asked for.
        const perYear = (n: number) => (stated.period === "hour" ? n * 2080 : n);
        const lo = perYear(stated.min ?? stated.max ?? 0);
        const hi = perYear(stated.max ?? stated.min ?? 0);
        if (f.salaryMin !== null && hi < f.salaryMin) return false;
        if (f.salaryMax !== null && lo > f.salaryMax) return false;
      }
    }

    if (!has(job.location, f.location)) return false;
    if (f.workMode !== "All" && job.workMode !== f.workMode) return false;
    if (!employmentMatches(job, f.employmentType)) return false;
    if (f.category !== "All" && job.category !== f.category) return false;
    if (f.seniority !== "All" && levelBucket(job) !== f.seniority) return false;

    if (f.postedWithinDays > 0) {
      const fr = freshness(job.postedAt, now);
      if (fr.days === null || fr.days > f.postedWithinDays) return false;
    }
    // "hideStale" keeps its name so saved filters still load. It now hides every posting that is likely closed.
    if (f.hideStale && likelyClosed(job, now).closed) return false;

    if (f.strongOnly && job.match?.recommendedAction !== "strong_match") return false;
    if (f.verifiedOnly && job.verification?.state !== "verified_active") return false;
    if (f.eligibility !== "All" && job.match?.eligibility?.status !== f.eligibility) return false;
    if (f.requiredSkills !== "All") {
      const detail = job.match?.detail;
      // A job whose required skills could not be read is neither complete nor missing some.
      const required = detail?.skillEvidence?.filter((s) => s.importance === "required") ?? [];
      if (!detail || !required.length) return false;
      // A skill only covered by a related one still counts as missing.
      const missing = required.some((s) => !detail.requiredMatched.includes(s.skill));
      if (missing === (f.requiredSkills === "none_missing")) return false;
    }
    if (f.transitionOnly && job.match?.detail?.careerAlignment?.relation !== "transition") return false;

    if (!has(job.company, f.company)) return false;
    if (!has(job.title, f.title)) return false;

    if (f.status !== "All") {
      const status = ctx.statusOf(job);
      if (f.status === "Not tracked" ? status !== null : status !== f.status) return false;
    }
    return true;
  });
}

/** How many filters differ from the defaults, for a badge on the filter panel. */
export function activeFilterCount(f: RefineFilters): number {
  const d = DEFAULT_REFINE;
  return (Object.keys(d) as (keyof RefineFilters)[]).filter((k) => f[k] !== d[k]).length;
}

export { yearlySalary };
