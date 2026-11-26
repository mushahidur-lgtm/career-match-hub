/** The logic behind the new filters, posting checks and the assessment cache. */
import { describe, expect, it, vi } from "vitest";
import { AssessmentSchema, assessmentKey, loadAssessment, saveAssessment } from "@/lib/assessment/cache";
import { ruleSection, type Assessment } from "@/lib/assessment/model";
import type { JobCheck } from "@/lib/jobs/check";
import { applyCheck } from "@/lib/jobs/apply-check";
import { scoreJob, type MatchInput } from "@/lib/matching/engine";
import { DEFAULT_REFINE, RefineSchema, activeFilterCount, refineJobs } from "@/lib/refine";
import { splitRanked } from "@/lib/search/rank";
import { CANDIDATE, CANDIDATE_PREFS, CANDIDATE_RESUME, SCENARIOS } from "./fixtures/matching-fixtures";
import { makeJob, memoryStorage } from "./helpers";

const input: MatchInput = { profile: CANDIDATE, resumeText: CANDIDATE_RESUME, preferences: CANDIDATE_PREFS };
const base = makeJob({ title: SCENARIOS[0].job.title, description: SCENARIOS[0].job.description.slice(0, 120), descriptionTruncated: true });
const job = { ...base, match: scoreJob(base, input) };
const check = (over: Partial<JobCheck> = {}): JobCheck => ({
  description: SCENARIOS[0].job.description,
  descriptionTruncated: false,
  enrichment: { status: "full", originalLength: 120, enrichedLength: SCENARIOS[0].job.description.length, source: "json_ld", retrievedAt: "2026-11-26T00:00:00Z", truncated: false },
  verification: { state: "verified_active", checkedAt: "2026-11-26T00:00:00Z", notes: ["ok"] },
  postingStatus: "retrieved",
  postingNotes: [],
  ...over,
});

describe("applying a posting check", () => {
  it("re-reads the fuller description with the rules", () => {
    const next = applyCheck(job, check(), input, true);
    expect(next.match!.detail!.requiredMatched.length).toBeGreaterThan(job.match.detail!.requiredMatched.length);
    expect(next.match!.ai!.status).toBe("not_shortlisted");
    expect(next.enrichment!.status).toBe("full");
  });
  it("takes a closed job out of recommendations", () => {
    const next = applyCheck(job, check({ description: job.description, descriptionTruncated: true, postingStatus: "expired", verification: { state: "closed", checkedAt: "2026-11-26T00:00:00Z", notes: ["gone"] } }), input, false);
    expect(next.match!.recommendedAction).toBe("not_recommended");
    expect(splitRanked([next]).excluded).toHaveLength(1);
  });
  it("leaves the score alone when nothing it reads changed", () => {
    const next = applyCheck(job, check({ description: job.description, descriptionTruncated: true, postingStatus: job.match.postingStatus! }), input, false);
    expect(next.match).toBe(job.match);
    expect(next.match!.score).toBe(job.match.score);
  });
});

describe("result filters", () => {
  const strong = { ...makeJob({ id: "s", title: SCENARIOS[0].job.title, description: SCENARIOS[0].job.description }), match: scoreJob(SCENARIOS[0].job, input) };
  const weak = { ...makeJob({ id: "w" }), match: scoreJob({ ...SCENARIOS[0].job, description: "Requirements:\n- Scala and Kafka" }, input) };
  const ids = (over: Partial<typeof DEFAULT_REFINE>) => refineJobs([strong, weak], { ...DEFAULT_REFINE, ...over }, { statusOf: () => null }).map((j) => j.id);

  it("reads filters saved before the new ones existed", () => {
    const old = { ...DEFAULT_REFINE, minScore: 60 } as Record<string, unknown>;
    for (const key of ["strongOnly", "verifiedOnly", "eligibility", "requiredSkills", "transitionOnly"]) delete old[key];
    expect(RefineSchema.parse(old)).toEqual({ ...DEFAULT_REFINE, minScore: 60 });
  });
  it("filters on strength, verification, eligibility and missing skills", () => {
    expect(ids({})).toEqual(["s", "w"]);
    expect(ids({ strongOnly: true })).toEqual(["s"]);
    expect(ids({ verifiedOnly: true })).toEqual([]);
    expect(ids({ requiredSkills: "some_missing" })).toEqual(["w"]);
    expect(ids({ requiredSkills: "none_missing" })).toEqual(["s"]);
    expect(ids({ eligibility: "needs_verification" })).toEqual([]);
    expect(activeFilterCount({ ...DEFAULT_REFINE, strongOnly: true, requiredSkills: "none_missing" })).toBe(2);
  });
});

describe("assessment cache", () => {
  it("keeps only finished assessments and survives damaged storage", () => {
    const store = memoryStorage();
    vi.stubGlobal("window", { localStorage: store });
    const value: Assessment = { status: "failed", rules: ruleSection(SCENARIOS[0].job, input), ai: null, notes: [], at: "2026-11-26T00:00:00Z", model: null };
    const key = assessmentKey("j", "r", 10, 20);
    saveAssessment(key, value);
    expect(loadAssessment(key)).toBeNull();
    saveAssessment(key, { ...value, status: "complete" });
    expect(AssessmentSchema.safeParse(loadAssessment(key)).success).toBe(true);
    store.setItem("cmh:assessments", "{broken");
    expect(loadAssessment(key)).toBeNull();
    vi.unstubAllGlobals();
  });
});
