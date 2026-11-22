import { describe, expect, it } from "vitest";
import { computeOverview } from "@/lib/overview";
import type { ApplicationStatus, Job, MatchResult, StoredResults } from "@/types/job";
import { makeJob, makeSaved } from "./helpers";

const now = new Date("2026-11-22T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

const withMatch = (score: number, skills: string[] = []): MatchResult => ({
  score,
  matchingSkills: skills,
  missingSkills: [],
  matchReason: "",
  source: "heuristic",
  detail: {
    confidence: "high",
    confidenceReasons: [],
    requiredMatched: skills,
    requiredMissing: [],
    preferredMatched: [],
    preferredMissing: [],
    transferable: [],
    evidence: [],
    experienceGaps: [],
    seniority: { status: "aligned", note: "" },
    location: { status: "yes", note: "" },
    salary: { status: "unknown", note: "" },
    components: [],
    caps: [],
    explanation: "",
  },
});

const job = (id: string, over: Partial<Job> = {}): Job => makeJob({ id, title: `Role ${id}`, company: `Co ${id}`, ...over });
const results = (jobs: Job[]): StoredResults => ({
  jobs,
  mode: "live",
  provider: "adzuna",
  scoring: "heuristic",
  warnings: [],
  filters: { query: "", location: "Ottawa, ON", category: "All", workMode: "All", employmentType: "All", minSalary: null },
  searchedAt: now.toISOString(),
  profileKey: "",
});
const saved = (j: Job, status: ApplicationStatus, updatedDaysAgo = 0, over = {}) =>
  makeSaved(j, { status, updatedAt: daysAgo(updatedDaysAgo), savedAt: daysAgo(updatedDaysAgo), ...over });

describe("overview with nothing yet", () => {
  it("is empty and does not invent numbers", () => {
    const o = computeOverview(null, [], now);
    expect(o.activeOpportunities).toBe(0);
    expect(o.excellent + o.strong + o.applicationsSent + o.interviews).toBe(0);
    expect(o.best).toEqual([]);
    expect(o.trendingSkills).toEqual([]);
  });
});

describe("counts", () => {
  const a = job("a", { match: withMatch(95) });
  const b = job("b", { match: withMatch(75) });
  const c = job("c", { match: withMatch(40) });

  it("splits excellent (90+) and strong (70-89)", () => {
    const o = computeOverview(results([a, b, c]), [], now);
    expect(o.activeOpportunities).toBe(3);
    expect(o.excellent).toBe(1);
    expect(o.strong).toBe(1);
  });

  it("counts a job once even when it is both in the results and saved", () => {
    const o = computeOverview(results([a, b]), [saved(a, "Interested")], now);
    expect(o.activeOpportunities).toBe(2);
  });

  it("counts a job found again under a new id once", () => {
    const again = job("a2", { match: withMatch(95), title: a.title, company: a.company, location: a.location });
    expect(computeOverview(results([a, again]), [], now).activeOpportunities).toBe(1);
  });

  it("drops rejected jobs from opportunities but still counts them as applications sent", () => {
    const o = computeOverview(results([a]), [saved(b, "Rejected")], now);
    expect(o.activeOpportunities).toBe(1);
    expect(o.applicationsSent).toBe(1);
  });

  it("counts applications sent and interviews from tracked statuses only", () => {
    const o = computeOverview(
      null,
      [saved(job("1"), "Interested"), saved(job("2"), "Applied"), saved(job("3"), "Interview"), saved(job("4"), "Offer"), saved(job("5"), "Rejected")],
      now,
    );
    expect(o.applicationsSent).toBe(4);
    expect(o.interviews).toBe(1);
  });

  it("keeps your status on a job that also appears in fresh results", () => {
    const o = computeOverview(results([a]), [saved(a, "Applied")], now);
    expect(o.opportunities[0].status).toBe("Applied");
  });
});

describe("lists", () => {
  it("best matches skip jobs you have already applied to", () => {
    const top = job("top", { match: withMatch(99) });
    const o = computeOverview(results([top, job("ok", { match: withMatch(80) })]), [saved(top, "Applied")], now);
    expect(o.best.map((x) => x.job.id)).toEqual(["ok"]);
  });

  it("newly discovered uses real posting dates and ignores missing ones", () => {
    const o = computeOverview(
      results([job("new", { postedAt: daysAgo(1) }), job("old", { postedAt: daysAgo(20) }), job("none", { postedAt: null }), job("mid", { postedAt: daysAgo(5) })]),
      [],
      now,
    );
    expect(o.newlyDiscovered.map((x) => x.job.id)).toEqual(["new", "mid"]);
  });

  it("highest salary ranks hourly pay by its yearly value and ignores estimated and missing pay", () => {
    const pay = (min: number, max: number, over = {}) => ({ min, max, currency: "CAD" as const, period: "year" as const, estimated: false, ...over });
    const o = computeOverview(
      results([
        job("low", { salary: pay(90_000, 100_000) }),
        job("high", { salary: pay(150_000, 180_000) }),
        job("hourly", { salary: pay(70, 100, { period: "hour" }) }), // about 208k
        job("guess", { salary: pay(300_000, 400_000, { estimated: true }) }),
        job("unknown", { salary: null }),
      ]),
      [],
      now,
    );
    expect(o.highestSalary.map((x) => x.job.id)).toEqual(["hourly", "high", "low"]);
  });
});

describe("applications needing attention", () => {
  it("flags an offer, a stalled interview, a quiet application and an unapplied excellent match", () => {
    const o = computeOverview(
      null,
      [
        saved(job("offer"), "Offer", 1),
        saved(job("interview"), "Interview", 6),
        saved(job("applied"), "Applied", 9),
        saved(job("excellent", { match: withMatch(95) }), "Interested", 3),
      ],
      now,
    );
    expect(o.attention.map((x) => x.job.id)).toEqual(["offer", "interview", "applied", "excellent"]);
    expect(o.attention[2].reason).toMatch(/9 days/);
  });

  it("leaves recent and routine items alone", () => {
    const o = computeOverview(null, [saved(job("fresh"), "Applied", 2), saved(job("low", { match: withMatch(60) }), "Interested", 10), saved(job("done"), "Rejected", 30)], now);
    expect(o.attention).toEqual([]);
  });
});

describe("trending skills", () => {
  it("counts skills across the jobs that were analysed, and says how many that was", () => {
    const o = computeOverview(
      results([job("1", { match: withMatch(80, ["Python", "SQL"]) }), job("2", { match: withMatch(80, ["Python"]) }), job("3", { match: null })]),
      [],
      now,
    );
    expect(o.trendingSkills[0]).toEqual({ skill: "Python", count: 2 });
    expect(o.trendingSkills[1]).toEqual({ skill: "SQL", count: 1 });
    expect(o.skillSampleSize).toBe(2);
  });
});
