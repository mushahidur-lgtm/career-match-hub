import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewJobs } from "@/lib/ai/career-fit";
import { isAiConfigured } from "@/lib/anthropic";
import { scoreJob } from "@/lib/matching/engine";
import { applyFilters } from "@/lib/providers/common";
import { fetchJobs } from "@/lib/providers";
import { badRequest, rateLimit } from "@/lib/rate-limit";
import { PreferencesSchema, ProfileSchema } from "@/lib/schemas";
import { toMatchInput } from "@/lib/search/match-input";
import { compareByFit, splitRanked } from "@/lib/search/rank";
import { EMPLOYMENT_FILTERS, JOB_CATEGORIES, WORK_MODES, type Job, type SearchResponse } from "@/types/job";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_RESULTS = 60;
const MAX_EXCLUDED = 30;
/** How many of the best rule-ranked jobs Claude reviews. AI_SHORTLIST overrides it; 0 switches the review off. */
const DEFAULT_SHORTLIST = 20;
const shortlistSize = () => {
  const raw = process.env.AI_SHORTLIST?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_RESULTS ? n : DEFAULT_SHORTLIST;
};

const text = (max: number) => z.string().max(max);

const RequestSchema = z.object({
  filters: z.object({
    query: text(120),
    location: text(120),
    category: z.enum(["All", ...JOB_CATEGORIES]),
    workMode: z.enum(["All", ...WORK_MODES]),
    employmentType: z.enum(EMPLOYMENT_FILTERS),
    minSalary: z.number().min(0).max(10_000_000).nullable(),
  }),
  profile: ProfileSchema.nullable(),
  resumeText: text(60_000).nullable().optional(),
  preferences: PreferencesSchema.optional(),
});

export async function POST(req: Request) {
  const limited = rateLimit(req, "search-jobs", 12);
  if (limited) return limited;

  let parsed;
  try {
    parsed = RequestSchema.safeParse(await req.json());
  } catch {
    return badRequest("Send JSON with filters and profile.");
  }
  if (!parsed.success) return badRequest("The search filters were not valid.");
  const { filters, profile, resumeText, preferences } = parsed.data;

  const { jobs: found, provider, warnings } = await fetchJobs(filters);
  const kept = applyFilters(found, filters);

  const input = profile ? toMatchInput(profile, resumeText ?? null, preferences) : null;

  // Stage 1: the rules screen every job, so results are ranked, gated and explained even without a key.
  const screened: Job[] = kept.map((job) => ({ ...job, match: input ? scoreJob(job, input) : null }));
  const split = splitRanked(screened);
  let ranked = split.ranked.slice(0, MAX_RESULTS);
  const excluded = split.excluded.slice(0, MAX_EXCLUDED);

  // With Claude connected, a job it was not asked about says so rather than "not connected".
  const notReviewed = (job: Job): Job => (job.match && isAiConfigured() ? { ...job, match: { ...job.match, ai: { status: "not_shortlisted" } } } : job);

  let scoring: SearchResponse["scoring"] = input ? "heuristic" : "none";
  let ai: SearchResponse["ai"];

  // Stage 2: Claude reviews a shortlist of the jobs that are still candidates.
  if (input && ranked.length) {
    const shortlist = ranked.slice(0, shortlistSize());
    ai = { status: isAiConfigured() ? "skipped" : "unavailable", shortlisted: 0, reviewed: 0, calls: 0, cached: 0, model: null };
    if (isAiConfigured() && shortlist.length) {
      const outcome = await reviewJobs(shortlist, input);
      ranked = ranked.map((job) => {
        const assessment = outcome.assessments.get(job.id);
        if (assessment) return { ...job, match: scoreJob(job, input, assessment) };
        if (!shortlist.some((s) => s.id === job.id)) return notReviewed(job);
        return { ...job, match: job.match && { ...job.match, ai: { status: "failed" as const } } };
      });
      ranked.sort(compareByFit);
      const reviewed = outcome.assessments.size;
      ai = { status: outcome.status, shortlisted: shortlist.length, reviewed, calls: outcome.calls, cached: outcome.cached, model: outcome.model };
      if (reviewed) scoring = reviewed === ranked.length ? "ai" : "mixed";
      if (outcome.status === "failed") warnings.push(`${outcome.error} Showing rule-based scores instead.`);
      else if (outcome.status === "partial") warnings.push(`Claude reviewed ${reviewed} of ${shortlist.length} shortlisted jobs. The rest show rule-based scores.`);
    }
    if (isAiConfigured() && !shortlist.length) ranked = ranked.map(notReviewed);
    if (ai.status === "unavailable") warnings.push("Claude is not connected, so these are rule-based scores only.");
  }

  const body: SearchResponse = {
    jobs: ranked,
    mode: provider === "demo" ? "demo" : provider === "none" ? "unconfigured" : "live",
    provider,
    scoring,
    warnings,
    ...(excluded.length ? { excluded: excluded.map(notReviewed) } : {}),
    ...(ai ? { ai } : {}),
  };
  return NextResponse.json(body);
}
