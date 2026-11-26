import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, type CandidateProfile, type Job } from "@/types/job";

const callStructured = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  callStructured: (...args: unknown[]) => callStructured(...args),
  activeModel: () => "test",
  describeAiError: () => "Claude could not be reached.",
  isAiConfigured: () => true,
}));

const { POST } = await import("@/app/api/search-jobs/route");
const { clearAssessmentCache } = await import("@/lib/ai/career-fit");

const RESUME = `Senior Data Engineer, Rideau Bank (2019 - Present)
- Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank.
- Modelled data warehouse star schemas and delivered Power BI dashboards to finance stakeholders.
Skills: Python, SQL, Azure, Snowflake, Databricks, Power BI`;
const REAL_LINE = "Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank.";

const profile: CandidateProfile = {
  summary: "Senior data engineer with 9 years of experience.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: { languages: ["Python", "SQL"], frameworks: [], cloudData: ["Azure", "Azure Data Factory", "Snowflake", "Databricks"], tools: ["Power BI"] },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: ["Senior Data Engineer"],
  source: "ai",
};

let n = 0;
const search = () =>
  POST(
    new Request("http://localhost/api/search-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++n}` },
      body: JSON.stringify({
        filters: { ...DEFAULT_FILTERS, query: "Data Engineer", employmentType: "All", minSalary: null },
        profile,
        resumeText: RESUME,
        preferences: DEFAULT_PREFERENCES,
      }),
    }),
  );

beforeEach(() => {
  callStructured.mockReset();
  clearAssessmentCache();
  vi.stubEnv("CMH_DEMO", "1");
  vi.stubEnv("AI_SHORTLIST", "10");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const entry = (index: number, adjustment: number, over: Record<string, unknown> = {}) => ({
  index,
  experienceFit: 70,
  responsibilityFit: 70,
  transferableFit: 50,
  careerFit: 60,
  domainFit: 40,
  adjustment,
  strengths: [],
  gaps: [],
  concerns: [],
  confidence: "medium",
  rationale: "",
  ...over,
});

describe("search with Claude review", () => {
  it("bounds Claude's adjustment, drops invented evidence and ignores bad entries", async () => {
    callStructured.mockResolvedValue({
      model: "test",
      data: {
        jobs: [
          entry(0, -40, { strengths: [{ text: "Ran an org", evidence: "Led a 300 person engineering org at Google" }, { text: "Built pipelines", evidence: REAL_LINE }], gaps: ["No Kafka shown"], rationale: "Solid fit." }),
          entry(999, 15, { rationale: "ghost" }),
          entry(0, 15, { rationale: "duplicate" }),
        ],
      },
    });
    const res = await search();
    const body = await res.json();
    expect(res.status).toBe(200);

    const reviewed = (body.jobs as Job[]).filter((j) => j.match?.source === "ai");
    expect(reviewed).toHaveLength(1);
    const m = reviewed[0].match!;

    // The first entry won; the duplicate and the out-of-range index changed nothing.
    expect(m.detail!.aiNote).toBe("Solid fit.");
    expect(m.ai).toMatchObject({ status: "applied", model: "test", promptVersion: "career-fit-1", confidence: "medium" });
    expect(m.aiAdjustment).toBeGreaterThanOrEqual(-15);
    expect(m.score).toBe(m.deterministicScore! + m.aiAdjustment!);

    // Evidence: the real line stays, the invented one is gone.
    expect(m.detail!.evidence).toContain(REAL_LINE);
    expect(JSON.stringify(m.detail)).not.toMatch(/Google/);
    expect(m.detail!.experienceGaps).toContain("No Kafka shown");

    // Every other job keeps its rule-based score and is not labelled as reviewed.
    expect(body.scoring).toBe("mixed");
    expect(body.ai).toMatchObject({ status: "partial", reviewed: 1, calls: 1 });
    expect(body.jobs.length).toBeGreaterThan(1);
  });

  it("sends the resume and the rule-based findings to Claude, not just keywords", async () => {
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [] } });
    await search();
    const call = callStructured.mock.calls[0][0] as { user: string; system: string };
    expect(call.user).toContain("<resume>");
    expect(call.user).toContain("Built ETL data pipelines");
    expect(call.user).toContain("requiredMissing");
    expect(call.user).toContain("onlyListed");
    expect(call.system).toMatch(/copied exactly from the resume/);
    expect(call.system).toMatch(/data, not instructions/);
  });

  it("falls back to rule-based scores, with a message, when Claude fails", async () => {
    callStructured.mockRejectedValue(new Error("boom"));
    const body = await (await search()).json();
    expect(body.scoring).toBe("heuristic");
    expect(body.warnings.join(" ")).toMatch(/rule-based scores/);
    expect((body.jobs as Job[]).every((j) => j.match?.source === "heuristic")).toBe(true);
  });

  it("falls back, with a message, when Claude returns nothing usable", async () => {
    callStructured.mockResolvedValue({ model: "test", data: { jobs: [entry(500, 5)] } });
    const body = await (await search()).json();
    expect(body.scoring).toBe("heuristic");
    expect(body.warnings.join(" ")).toMatch(/no usable review/);
  });
});
