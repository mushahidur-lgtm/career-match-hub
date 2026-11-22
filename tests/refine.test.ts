import { describe, expect, it } from "vitest";
import { DEFAULT_REFINE, RefineSchema, activeFilterCount, refineJobs, type RefineFilters } from "@/lib/refine";
import { jobsToCsv } from "@/lib/export";
import { sortJobs } from "@/lib/format";
import type { ApplicationStatus, Job, MatchResult } from "@/types/job";
import { makeJob } from "./helpers";

const now = new Date("2026-11-22T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const f = (over: Partial<RefineFilters> = {}): RefineFilters => ({ ...DEFAULT_REFINE, ...over });
const ids = (jobs: Job[]) => jobs.map((j) => j.id);
const run = (jobs: Job[], over: Partial<RefineFilters>, status: Record<string, ApplicationStatus> = {}) =>
  ids(refineJobs(jobs, f(over), { now, statusOf: (j) => status[j.id] ?? null }));
const match = (score: number): MatchResult => ({ score, matchingSkills: [], missingSkills: [], matchReason: "", source: "heuristic" });
const pay = (min: number, max: number, over = {}) => ({ min, max, currency: "CAD" as const, period: "year" as const, estimated: false, ...over });

describe("with the defaults", () => {
  it("shows everything and counts no active filters", () => {
    const jobs = [makeJob({ id: "a" }), makeJob({ id: "b", salary: null, postedAt: null })];
    expect(run(jobs, {})).toEqual(["a", "b"]);
    expect(activeFilterCount(DEFAULT_REFINE)).toBe(0);
  });
  it("counts each changed filter", () => {
    expect(activeFilterCount(f({ minScore: 70, company: "acme", hideStale: true }))).toBe(3);
  });
});

describe("match score", () => {
  const jobs = [makeJob({ id: "hi", match: match(92) }), makeJob({ id: "mid", match: match(75) }), makeJob({ id: "lo", match: match(40) }), makeJob({ id: "none", match: null })];
  it("keeps jobs at or above the minimum", () => {
    expect(run(jobs, { minScore: 70 })).toEqual(["hi", "mid"]);
    expect(run(jobs, { minScore: 90 })).toEqual(["hi"]);
  });
  it("hides unscored jobs once a minimum is set", () => {
    expect(run(jobs, { minScore: 1 })).not.toContain("none");
  });
});

describe("salary range", () => {
  const jobs = [
    makeJob({ id: "low", salary: pay(70_000, 90_000) }),
    makeJob({ id: "mid", salary: pay(95_000, 120_000) }),
    makeJob({ id: "high", salary: pay(150_000, 190_000) }),
    makeJob({ id: "hourly", salary: pay(55, 70, { period: "hour" }) }), // 114k to 146k a year
    makeJob({ id: "none", salary: null }),
    makeJob({ id: "guess", salary: pay(300_000, 400_000, { estimated: true }) }),
  ];
  it("keeps jobs whose range overlaps the one asked for", () => {
    expect(run(jobs, { salaryMin: 100_000, salaryMax: 130_000 })).toEqual(["mid", "hourly", "none", "guess"]);
  });
  it("applies a minimum alone and a maximum alone", () => {
    expect(run(jobs, { salaryMin: 140_000, includeUnknownSalary: false })).toEqual(["high", "hourly"]);
    expect(run(jobs, { salaryMax: 80_000, includeUnknownSalary: false })).toEqual(["low"]);
  });
  it("keeps or hides unknown salaries on request, treating estimates as unknown", () => {
    expect(run(jobs, { salaryMin: 100_000, includeUnknownSalary: false })).toEqual(["mid", "high", "hourly"]);
  });
});

describe("work arrangement, employment, category and seniority", () => {
  it("filters work mode strictly", () => {
    const jobs = [makeJob({ id: "r", workMode: "Remote" }), makeJob({ id: "h", workMode: "Hybrid" }), makeJob({ id: "n", workMode: "Not stated" })];
    expect(run(jobs, { workMode: "Hybrid" })).toEqual(["h"]);
  });
  it("filters employment type, keeping postings that do not say", () => {
    const jobs = [makeJob({ id: "ft", employmentType: "Full-time" }), makeJob({ id: "ct", employmentType: "Contract" }), makeJob({ id: "ns", employmentType: "Not stated" })];
    expect(run(jobs, { employmentType: "Permanent full-time" })).toEqual(["ft", "ns"]);
    expect(run(jobs, { employmentType: "Contract" })).toEqual(["ct", "ns"]);
  });
  it("filters category", () => {
    const jobs = [makeJob({ id: "d", category: "Data and analytics" }), makeJob({ id: "s", category: "Software engineering" })];
    expect(run(jobs, { category: "Software engineering" })).toEqual(["s"]);
  });
  it("filters the level the posting asks for", () => {
    const jobs = [makeJob({ id: "j", title: "Junior Analyst" }), makeJob({ id: "s", title: "Senior Analyst" }), makeJob({ id: "l", title: "Lead Analyst" }), makeJob({ id: "x", title: "Analyst", description: "Join us" })];
    expect(run(jobs, { seniority: "Senior" })).toEqual(["s"]);
    expect(run(jobs, { seniority: "Lead or above" })).toEqual(["l"]);
    expect(run(jobs, { seniority: "Not stated" })).toEqual(["x"]);
  });
});

describe("posted date and stale postings", () => {
  const jobs = [
    makeJob({ id: "today", postedAt: daysAgo(0) }),
    makeJob({ id: "d5", postedAt: daysAgo(5) }),
    makeJob({ id: "d40", postedAt: daysAgo(40) }),
    makeJob({ id: "nodate", postedAt: null }),
  ];
  it("keeps jobs posted within the window", () => {
    expect(run(jobs, { postedWithinDays: 1 })).toEqual(["today"]);
    expect(run(jobs, { postedWithinDays: 7 })).toEqual(["today", "d5"]);
  });
  it("does not let a job with no date pass a date limit, because its age is unknown", () => {
    expect(run(jobs, { postedWithinDays: 30 })).not.toContain("nodate");
  });
  it("hides stale postings but keeps ones with no date", () => {
    expect(run(jobs, { hideStale: true })).toEqual(["today", "d5", "nodate"]);
  });
});

describe("text filters", () => {
  const jobs = [
    makeJob({ id: "a", title: "Data Engineer", company: "Acme Corp", location: "Kanata, ON" }),
    makeJob({ id: "b", title: "BI Developer", company: "Globex", location: "Toronto, ON" }),
  ];
  it("matches part of a location, company or title without regard to case", () => {
    expect(run(jobs, { location: "kanata" })).toEqual(["a"]);
    expect(run(jobs, { company: "GLOBE" })).toEqual(["b"]);
    expect(run(jobs, { title: "engineer" })).toEqual(["a"]);
  });
  it("ignores blank filters and stray spaces", () => {
    expect(run(jobs, { title: "   " })).toEqual(["a", "b"]);
    expect(run(jobs, { company: " acme " })).toEqual(["a"]);
  });
});

describe("application status", () => {
  const jobs = [makeJob({ id: "a" }), makeJob({ id: "b" }), makeJob({ id: "c" })];
  const status = { a: "Applied", b: "Interested" } as Record<string, ApplicationStatus>;
  it("filters by a status", () => expect(run(jobs, { status: "Applied" }, status)).toEqual(["a"]));
  it("finds jobs you are not tracking", () => expect(run(jobs, { status: "Not tracked" }, status)).toEqual(["c"]));
});

describe("combining filters", () => {
  it("applies all of them together", () => {
    const jobs = [
      makeJob({ id: "ok", match: match(85), workMode: "Hybrid", salary: pay(110_000, 130_000), postedAt: daysAgo(2) }),
      makeJob({ id: "wrongMode", match: match(85), workMode: "Remote", salary: pay(110_000, 130_000), postedAt: daysAgo(2) }),
      makeJob({ id: "lowScore", match: match(50), workMode: "Hybrid", salary: pay(110_000, 130_000), postedAt: daysAgo(2) }),
    ];
    expect(run(jobs, { minScore: 70, workMode: "Hybrid", salaryMin: 100_000, postedWithinDays: 7 })).toEqual(["ok"]);
  });
  it("does not change the jobs it is given", () => {
    const jobs = [makeJob({ id: "a" }), makeJob({ id: "b", match: match(10) })];
    const copy = JSON.stringify(jobs);
    refineJobs(jobs, f({ minScore: 50 }), { now, statusOf: () => null });
    expect(JSON.stringify(jobs)).toBe(copy);
  });
});

describe("stored filters", () => {
  it("the defaults are valid", () => expect(RefineSchema.safeParse(DEFAULT_REFINE).success).toBe(true));
  it("rejects a filter value that is not allowed", () => {
    expect(RefineSchema.safeParse({ ...DEFAULT_REFINE, postedWithinDays: 5 }).success).toBe(false);
    expect(RefineSchema.safeParse({ ...DEFAULT_REFINE, seniority: "Wizard" }).success).toBe(false);
  });
});

describe("sorting", () => {
  const a = makeJob({ id: "a", company: "Zeta", match: match(60), postedAt: daysAgo(10), salary: pay(100_000, 110_000) });
  const b = makeJob({ id: "b", company: "Alpha", match: match(90), postedAt: daysAgo(1), salary: pay(150_000, 160_000) });
  const c = makeJob({ id: "c", company: "Mid", match: null, postedAt: null, salary: null });
  it("by match, newest, salary and company", () => {
    expect(ids(sortJobs([a, b, c], "score"))).toEqual(["b", "a", "c"]);
    expect(ids(sortJobs([a, b, c], "newest"))).toEqual(["b", "a", "c"]);
    expect(ids(sortJobs([a, b, c], "salary"))).toEqual(["b", "a", "c"]);
    expect(ids(sortJobs([a, b, c], "company"))).toEqual(["b", "c", "a"]);
  });
});

describe("exporting results", () => {
  it("writes what the listing says, with the status and age, and fills nothing in", () => {
    const j = makeJob({ id: "a", title: "Data Engineer", salary: null, postedAt: null, match: match(88), duplicateCount: 2 });
    const csv = jobsToCsv([j], () => "Applied", now);
    const [header, row] = csv.replace("\uFEFF", "").split("\r\n");
    expect(header).toContain("Match score");
    expect(row).toContain("Data Engineer");
    expect(row).toContain("Salary unknown");
    expect(row).toContain("Date not listed");
    expect(row).toContain("Applied");
    expect(row).toContain('","88","');
  });
  it("neutralises spreadsheet formulas in a title", () => {
    const csv = jobsToCsv([makeJob({ title: '=HYPERLINK("http://x")' })], () => null, now);
    expect(csv).toContain("\"'=HYPERLINK");
  });
  it("has only the header for no jobs", () => {
    expect(jobsToCsv([], () => null, now).split("\r\n")).toHaveLength(1);
  });
});
