/** The on-demand assessment. Claude is always a stand-in. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelAnswerSchema, type Assessment, type ModelAnswer } from "@/lib/assessment/model";
import { DEFAULT_PREFERENCES } from "@/types/job";
import { CANDIDATE, CANDIDATE_RESUME, SCENARIOS } from "./fixtures/matching-fixtures";

const callStructured = vi.fn();
let aiOn = true;
vi.mock("@/lib/anthropic", () => ({
  callStructured: (...args: unknown[]) => callStructured(...args),
  activeModel: () => "test",
  describeAiError: () => "Claude could not be reached.",
  isAiConfigured: () => aiOn,
}));

const { POST } = await import("@/app/api/job-assessment/route");
const { assessJob, clearDeepCache } = await import("@/lib/ai/deep-assessment");

const job = SCENARIOS[0].job;
const REAL = "Developed C# and ASP.NET Web API services backed by SQL Server stored procedures for HR data.";
const DUTY = "Design and build integrations and REST APIs between our HR and payroll systems.";

const answer = (over: Partial<ModelAnswer> = {}): ModelAnswer => ({
  summary: "A close fit.",
  recommendation: "strongly_recommend",
  reasons: ["Direct experience."],
  confidence: "high",
  caveats: [],
  professionalExperience: [
    { point: "Builds APIs", evidence: REAL },
    { point: "Ran a 300 person org", evidence: "Led a 300 person engineering organisation at Google" },
  ],
  projectExperience: [],
  experienceGaps: ["No Python in work"],
  seniority: "Senior, as asked.",
  responsibilities: [
    { duty: DUTY, evidence: REAL, alignment: "demonstrated" },
    { duty: "Work with HR stakeholders on requirements and coordinate releases.", evidence: "Invented line about stakeholders", alignment: "demonstrated" },
    { duty: "Run the company's marketing campaigns", evidence: REAL, alignment: "demonstrated" },
  ],
  technicalTopics: ["a", "b", "c", "d"],
  experienceQuestions: ["q1", "q2", "q3"],
  skillsToRevise: ["Python"],
  examples: [
    { suggestion: "Tell the API story", evidence: REAL },
    { suggestion: "Tell the Mars story", evidence: "Landed a rover on Mars" },
  ],
  ...over,
});
const reply = (over: Partial<ModelAnswer> = {}) => ({ model: "test", data: answer(over) });

let n = 0;
const body = { job: { title: job.title, company: "Acme", location: job.location, workMode: job.workMode, description: job.description, descriptionTruncated: false }, resumeText: CANDIDATE_RESUME, profile: CANDIDATE, preferences: DEFAULT_PREFERENCES };
const call = async (payload: unknown = body) => {
  const res = await POST(new Request("http://localhost/api/job-assessment", { method: "POST", body: JSON.stringify(payload), headers: { "x-forwarded-for": `10.8.0.${++n}` } }));
  return { status: res.status, data: (await res.json()) as Assessment };
};

beforeEach(() => {
  callStructured.mockReset();
  clearDeepCache();
  aiOn = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("a valid answer", () => {
  it("keeps only what the resume and posting support", async () => {
    callStructured.mockResolvedValue(reply());
    const { data } = await call();
    expect(data.status).toBe("complete");
    expect(data.ai!.professionalExperience).toEqual([{ point: "Builds APIs", evidence: REAL }]);
    expect(data.ai!.interview.examples).toHaveLength(1);
    expect(data.ai!.interview.technicalTopics).toHaveLength(3);
    expect(data.ai!.responsibilities.map((r) => r.alignment)).toEqual(["demonstrated", "not_shown"]);
    expect(JSON.stringify(data)).not.toMatch(/Google|Mars|marketing campaigns/);
    expect(data.notes.join(" ")).toMatch(/removed because no matching resume line/);
  });
  it("takes skills and gaps from the rules, and gives no score of its own", async () => {
    callStructured.mockResolvedValue(reply());
    const { data } = await call();
    expect(data.rules.requiredMatched).toContain("C#");
    expect(data.rules.weaklyShown).toContainEqual({ skill: "Python", level: "listed" });
    expect(Object.keys(ModelAnswerSchema.shape)).not.toContain("score");
  });
  it("cannot override a confirmed eligibility failure", async () => {
    callStructured.mockResolvedValue(reply());
    const { data } = await call({
      ...body,
      job: { ...body.job, description: SCENARIOS[4].job.description },
      preferences: { ...DEFAULT_PREFERENCES, facts: { workAuthorization: "work_permit" } },
    });
    expect(data.rules.eligibility).toBe("not_eligible");
    expect(data.ai!.recommendation).toBe("not_eligible");
  });
  it("cannot declare someone ineligible, or praise a closed posting", async () => {
    callStructured.mockResolvedValue(reply({ recommendation: "not_eligible" }));
    expect((await call()).data.ai!.recommendation).not.toBe("not_eligible");
    clearDeepCache();
    callStructured.mockResolvedValue(reply());
    expect((await call({ ...body, job: { ...body.job, postingStatus: "expired" } })).data.ai!.recommendation).toBe("low_priority");
  });
  it("is cached for the same job and resume", async () => {
    callStructured.mockResolvedValue(reply());
    await call();
    await call();
    expect(callStructured).toHaveBeenCalledTimes(1);
  });
});

describe("when Claude cannot help", () => {
  it("says it is unavailable and still returns the rule findings", async () => {
    aiOn = false;
    const { status, data } = await call();
    expect(status).toBe(200);
    expect(data).toMatchObject({ status: "unavailable", ai: null });
    expect(data.rules.requiredMatched.length).toBeGreaterThan(0);
    expect(callStructured).not.toHaveBeenCalled();
  });
  it("asks once more when the answer does not validate", async () => {
    callStructured.mockResolvedValueOnce({ model: "test", data: { summary: 1 } }).mockResolvedValueOnce(reply());
    expect((await call()).data.status).toBe("complete");
    expect(callStructured).toHaveBeenCalledTimes(2);
  });
  it("retries unreadable JSON once, then reports failure without caching it", async () => {
    callStructured.mockRejectedValue(new SyntaxError("Unexpected token"));
    const { data } = await call();
    expect(data).toMatchObject({ status: "failed", ai: null });
    expect(callStructured).toHaveBeenCalledTimes(2);
    callStructured.mockResolvedValue(reply());
    expect((await call()).data.status).toBe("complete");
  });
  it("does not retry an API error itself", async () => {
    callStructured.mockRejectedValue(Object.assign(new Error("rate"), { status: 429 }));
    expect((await call()).data.status).toBe("failed");
    expect(callStructured).toHaveBeenCalledTimes(1);
  });
  it("gives up when the time runs out", async () => {
    vi.useFakeTimers();
    callStructured.mockReturnValue(new Promise(() => undefined));
    const pending = assessJob({ ...job, company: "Acme" }, { profile: CANDIDATE, resumeText: CANDIDATE_RESUME });
    await vi.advanceTimersByTimeAsync(101_000);
    await expect(pending).resolves.toMatchObject({ status: "failed", notes: [expect.stringMatching(/took too long/)] });
    vi.useRealTimers();
  });
});

describe("request limits", () => {
  it("validates input and limits how often one client may ask", async () => {
    expect((await call({ job: {} })).status).toBe(400);
    expect((await call({ ...body, resumeText: "short" })).status).toBe(400);
    aiOn = false;
    let last = 200;
    for (let i = 0; i < 8; i++) {
      const res = await POST(new Request("http://localhost/api/job-assessment", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "10.8.9.9" } }));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
