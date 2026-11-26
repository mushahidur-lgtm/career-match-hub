/** Feedback analytics and job-source reliability. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as status } from "@/app/api/status/route";
import { computeAnalytics, MIN_APPLIED_FOR_REVIEW, type AnalyticsFilter } from "@/lib/analytics/feedback-analytics";
import { jobKey } from "@/lib/backup";
import { readFeedback, recordFeedback, type FeedbackEvent } from "@/lib/feedback";
import { inferWorkMode } from "@/lib/providers/common";
import { providerHealth, resetProviderHealth } from "@/lib/providers/health";
import { fetchJobs } from "@/lib/providers";
import { scoreJob } from "@/lib/matching/engine";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES } from "@/types/job";
import { CANDIDATE, SCENARIOS } from "./fixtures/matching-fixtures";
import { makeJob, makeSaved } from "./helpers";

const now = new Date("2026-11-26T12:00:00Z");
const all: AnalyticsFilter = { days: null, category: "All" };
const event = (n: number, type: FeedbackEvent["type"], over: Partial<FeedbackEvent> = {}): FeedbackEvent => ({ id: `e${n}-${type}`, at: "2026-11-20T10:00:00Z", type, jobKey: `job-${n}`, title: "t", company: "c", score: 60 + n, ...over });

describe("feedback analytics", () => {
  const events = [
    ...[1, 2, 3, 4, 5, 6].map((n) => event(n, "application_submitted", { category: "Data and analytics", missing: n < 4 ? ["Python"] : ["Kafka"] })),
    event(1, "interview"),
    event(2, "interview"),
    event(1, "offer"),
    event(7, "viewed", { category: "Design", at: "2026-08-01T00:00:00Z" }),
    event(2, "skill_match_corrected", { detail: "Python" }),
  ];
  const run = (filter = all, over: Partial<Parameters<typeof computeAnalytics>[0]> = {}) => computeAnalytics({ events, applications: [], seen: [], skills: [], ...over }, filter, now);

  it("counts jobs once and computes conversion with enough applications", () => {
    const a = run();
    expect(a).toMatchObject({ reviewed: 7, applied: 6, interviews: 2, offers: 1, interviewRate: 33, offerRate: 17 });
    expect(a.avgScoreApplied).toEqual({ value: 64, of: 6 });
    expect(a.avgScoreInterview).toEqual({ value: 62, of: 2 });
    expect(a.missingSkills.slice(0, 2)).toEqual([{ label: "Kafka", count: 3 }, { label: "Python", count: 3 }]);
    expect(a.correctedSkills).toEqual([{ label: "Python", count: 1 }]);
  });
  it("gives no rate for a handful of applications", () => {
    const a = computeAnalytics({ events: events.slice(0, 2), applications: [], seen: [], skills: [] }, all, now);
    expect(a.interviewRate).toBeNull();
  });
  it("filters by date and category", () => {
    expect(run({ days: 30, category: "All" }).reviewed).toBe(6);
    expect(run({ days: null, category: "Design" as never }).reviewed).toBe(1);
  });
  it("joins tracked applications from before events existed", () => {
    const job = makeJob({ title: "Old Role", company: "Past Co" });
    const a = run(all, { events: [], applications: [makeSaved(job, { status: "Interview", appliedAt: "2026-11-01" })] });
    expect(a).toMatchObject({ reviewed: 1, applied: 1, interviews: 1, categories: [expect.objectContaining({ category: "Data and analytics" })] });
    expect(jobKey(job)).toBeTruthy();
  });
  it("proposes nothing about weights until there is enough history, and never changes them", () => {
    const before = JSON.stringify(DEFAULT_PREFERENCES);
    const a = run();
    expect(a.review.ready).toBe(false);
    expect(a.review.note).toContain(`of ${MIN_APPLIED_FOR_REVIEW} applications`);
    expect(JSON.stringify(DEFAULT_PREFERENCES)).toBe(before);
  });
  it("records category and missing skills on new events, and still reads old ones", () => {
    const job = makeJob({ match: scoreJob(SCENARIOS[0].job, { profile: CANDIDATE }) });
    const [recorded] = recordFeedback([], "saved", job, undefined, now);
    expect(recorded).toMatchObject({ category: "Data and analytics", missing: expect.any(Array) });
    expect(readFeedback([event(1, "saved"), recorded])).toHaveLength(2);
  });
});

describe("job source reliability", () => {
  const adzuna = { results: [{ id: "1", title: "Developer", description: "Work.", created: "2026-11-20T00:00:00Z", salary_min: 130000, salary_max: 110000 }, { id: "2", title: "Analyst", description: "Work.", created: "2026-11-20T00:00:00Z", salary_min: 0, salary_max: 45 }] };
  let calls: string[] = [];
  let script: (url: string, n: number) => Response | Error;

  beforeEach(() => {
    calls = [];
    resetProviderHealth();
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    vi.stubEnv("RAPIDAPI_KEY", "");
    vi.stubEnv("CMH_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADZUNA_PAGES", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const out = script(url, calls.length);
      if (out instanceof Error) throw out;
      return out;
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const search = (location = "Toronto, ON") => fetchJobs({ ...DEFAULT_FILTERS, location });

  it("retries a server fault once, and succeeds", async () => {
    script = (_u, n) => (n === 1 ? new Response("", { status: 503 }) : Response.json(adzuna));
    const r = await search();
    expect(calls).toHaveLength(2);
    expect(r.sources).toEqual([{ id: "adzuna", status: "ok", count: 2 }]);
  });
  it("does not retry a rate limit or a rejected key", async () => {
    for (const code of [429, 401]) {
      calls = [];
      script = () => new Response("", { status: code });
      const r = await search();
      expect(calls).toHaveLength(1);
      expect(r.jobs).toEqual([]);
      expect(r.sources![0].status).toBe("failed");
    }
  });
  it("names a timeout and invents no jobs", async () => {
    script = () => Object.assign(new Error("slow"), { name: "TimeoutError" });
    const r = await search();
    expect(r.warnings.join(" ")).toMatch(/did not answer in time/);
    expect(r.jobs).toEqual([]);
    expect(r.provider).toBe("adzuna");
  });
  it("keeps one country's results when the other fails", async () => {
    script = (url) => (url.includes("/jobs/us/") ? new Response("", { status: 429 }) : Response.json(adzuna));
    const r = await search("Remote - Anywhere");
    expect(r.jobs.length).toBeGreaterThan(0);
  });
  it("tidies salaries without inventing them", async () => {
    script = () => Response.json(adzuna);
    const r = await search();
    expect(r.jobs[0].salary).toMatchObject({ min: 110000, max: 130000 });
    expect(r.jobs[1].salary).toBeNull();
  });
  it("widens a search for GTA to the Toronto area", async () => {
    script = () => Response.json(adzuna);
    await search("GTA, ON");
    expect(calls[0]).toContain("where=Toronto");
    expect(calls[0]).toContain("distance=60");
  });
  it("asks for more pages only when told to", async () => {
    script = () => Response.json(adzuna);
    vi.stubEnv("ADZUNA_PAGES", "2");
    await search();
    expect(calls.map((u) => u.match(/search\/(\d)/)![1])).toEqual(["1", "2"]);
  });
  it("reports health from what it has seen, without calling anything", async () => {
    const configured = { adzuna: true, jsearch: false };
    expect(providerHealth(configured).map((p) => p.state)).toEqual(["unknown", "not_configured"]);
    script = () => new Response("", { status: 429 });
    await search();
    calls = [];
    const body = await (await status()).json();
    expect(calls).toEqual([]);
    expect(body).toMatchObject({ ai: expect.any(Boolean), jobProvider: "adzuna", recruiterWebSearch: expect.any(Boolean) });
    expect(body.providers[0]).toMatchObject({ id: "adzuna", state: "failing", lastFailure: "rate_limit" });
  });
});

describe("work arrangement", () => {
  it("does not read 'not remote' as remote", () => {
    expect(inferWorkMode("Developer", "This is not a remote role. You work in the office.")).toBe("Not stated");
    expect(inferWorkMode("Developer", "No remote work. On-site only.")).toBe("On-site");
    expect(inferWorkMode("Developer", "This role is fully remote.")).toBe("Remote");
  });
});
