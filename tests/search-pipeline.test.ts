/** H: AI unavailable, plus provider failure, invalid AI output, shortlist, cache and API compatibility. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, type Job, type SearchResponse } from "@/types/job";
import { CANDIDATE, CANDIDATE_RESUME, SCENARIOS } from "./fixtures/matching-fixtures";

const callStructured = vi.fn();
let aiOn = true;
vi.mock("@/lib/anthropic", () => ({
  callStructured: (...args: unknown[]) => callStructured(...args),
  activeModel: () => "test",
  describeAiError: () => "Claude could not be reached.",
  isAiConfigured: () => aiOn,
}));

const { POST } = await import("@/app/api/search-jobs/route");
const { clearAssessmentCache } = await import("@/lib/ai/career-fit");

const longText = (id: string) => SCENARIOS.find((s) => s.id === id)!.job.description;
const adzuna = {
  results: [
    { id: "1", title: "Senior Integration Developer", description: longText("A"), created: "2026-11-20T00:00:00Z", company: { display_name: "Acme" }, location: { display_name: "Toronto, Ontario" }, redirect_url: "https://www.adzuna.ca/1" },
    { id: "2", title: "Senior .NET Developer", description: longText("E"), created: "2026-11-20T00:00:00Z", company: { display_name: "Dept" }, location: { display_name: "Toronto, Ontario" }, redirect_url: "https://www.adzuna.ca/2" },
  ],
};
const jsearch = {
  data: [{ job_id: "9", job_title: "Integration Developer", employer_name: "Globex", job_description: longText("A"), job_city: "Toronto", job_state: "ON", job_apply_link: "https://globex.example/jobs/9" }],
};

let n = 0;
let fail: string[] = [];
const search = async (preferences = DEFAULT_PREFERENCES) => {
  const res = await POST(
    new Request("http://localhost/api/search-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++n}` },
      body: JSON.stringify({ filters: { ...DEFAULT_FILTERS, query: "Developer", location: "Toronto, ON", employmentType: "All", minSalary: null }, profile: CANDIDATE, resumeText: CANDIDATE_RESUME, preferences }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
};
const facts = { ...DEFAULT_PREFERENCES, facts: { workAuthorization: "work_permit" as const } };

const logged: unknown[][] = [];
beforeEach(() => {
  callStructured.mockReset();
  clearAssessmentCache();
  aiOn = true;
  fail = [];
  logged.length = 0;
  vi.stubEnv("ADZUNA_APP_ID", "id");
  vi.stubEnv("ADZUNA_APP_KEY", "key");
  vi.stubEnv("RAPIDAPI_KEY", "rapid");
  vi.stubEnv("CMH_DEMO", "");
  vi.stubEnv("AI_SHORTLIST", "");
  vi.stubEnv("JOB_PROVIDER_MODE", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation((...args) => void logged.push(args));
  vi.stubGlobal("fetch", async (url: string) => {
    const source = url.includes("adzuna") ? "adzuna" : "jsearch";
    if (fail.includes(source)) return new Response("slow down", { status: 429 });
    return Response.json(source === "adzuna" ? adzuna : jsearch);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("H: AI unavailable", () => {
  it("returns deterministic results and says so", async () => {
    aiOn = false;
    const body = await search();
    expect(body.scoring).toBe("heuristic");
    expect(body.ai).toMatchObject({ status: "unavailable", calls: 0 });
    expect(body.warnings.join(" ")).toMatch(/rule-based scores only/);
    for (const j of body.jobs) {
      expect(j.match!.ai!.status).toBe("unavailable");
      expect(j.match!.aiAdjustment).toBe(0);
      expect(j.match!.score).toBe(j.match!.deterministicScore);
    }
    expect(callStructured).not.toHaveBeenCalled();
  });
});

describe("providers", () => {
  it("falls back to the next source when the first is rate limited", async () => {
    aiOn = false;
    fail = ["adzuna"];
    const body = await search();
    expect(body.provider).toBe("jsearch");
    expect(body.warnings).toContain("Adzuna rate limit reached.");
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].retrievedAt).toBeTruthy();
    expect(body.jobs[0].postingStatus).toBe("retrieved");
  });
  it("asks every source in 'all' mode and keeps partial results when one fails", async () => {
    aiOn = false;
    vi.stubEnv("JOB_PROVIDER_MODE", "all");
    const both = await search();
    expect(new Set(both.jobs.map((j) => j.source))).toEqual(new Set(["adzuna", "jsearch"]));
    expect(both.jobs.find((j) => j.source === "adzuna")!.postingStatus).toBe("partial");
    fail = ["jsearch"];
    const partial = await search();
    expect(partial.jobs.every((j) => j.source === "adzuna")).toBe(true);
    expect(partial.warnings).toContain("JSearch rate limit reached.");
  });
});

describe("eligibility in search", () => {
  it("moves a confirmed mismatch to the excluded list and never sends it to Claude", async () => {
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [] } });
    const body = await search(facts);
    expect(body.excluded!.map((j) => j.id)).toEqual(["adzuna-2"]);
    expect(body.jobs.map((j) => j.id)).toEqual(["adzuna-1"]);
    expect((callStructured.mock.calls[0][0] as { user: string }).user).not.toMatch(/Canadian citizens/);
  });
});

const good = { index: 0, experienceFit: 80, responsibilityFit: 80, transferableFit: 60, careerFit: 80, domainFit: 50, adjustment: 4, strengths: [], gaps: [], concerns: [], confidence: "high", rationale: "Close fit." };

describe("AI stage", () => {
  it("rejects output that does not match the schema", async () => {
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [{ index: 0, adjustment: "lots" }] } });
    const body = await search(facts);
    expect(body.ai!.status).toBe("failed");
    expect(body.scoring).toBe("heuristic");
    expect(body.jobs[0].match!.ai!.status).toBe("failed");
    expect(body.warnings.join(" ")).toMatch(/rule-based scores/);
  });
  it("caches by hash so a repeated search costs nothing", async () => {
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [good] } });
    const first = await search(facts);
    const second = await search(facts);
    expect(first.ai).toMatchObject({ status: "applied", calls: 1, cached: 0 });
    expect(second.ai).toMatchObject({ status: "applied", calls: 0, cached: 1 });
    expect(callStructured).toHaveBeenCalledTimes(1);
    expect(second.jobs[0].match!.score).toBe(first.jobs[0].match!.score);
  });
  it("can be switched off", async () => {
    vi.stubEnv("AI_SHORTLIST", "0");
    const body = await search(facts);
    expect(body.ai!.status).toBe("skipped");
    expect(callStructured).not.toHaveBeenCalled();
  });
  it("logs no resume or prompt content when a call fails", async () => {
    callStructured.mockRejectedValue(new Error(`bad request: ${CANDIDATE_RESUME}`));
    await search(facts);
    expect(JSON.stringify(logged)).not.toMatch(/Northfield/);
  });
  it("never returns prompts or keys to the client", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-secret-value");
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [good] } });
    const text = JSON.stringify(await search(facts));
    expect(text).not.toMatch(/sk-secret-value|data, not instructions|rapid"/);
  });
});

describe("response compatibility", () => {
  it("keeps the v1 fields", async () => {
    aiOn = false;
    const body = await search();
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["jobs", "mode", "provider", "scoring", "warnings"]));
    const m = (body.jobs as Job[])[0].match!;
    expect(m).toMatchObject({ score: expect.any(Number), matchingSkills: expect.any(Array), missingSkills: expect.any(Array), matchReason: expect.any(String), source: "heuristic" });
  });
});
