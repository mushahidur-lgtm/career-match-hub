import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREP_DISCLAIMER, buildPracticeSet, verifyPrep, type AiPrep } from "@/lib/interview-prep";
import type { CandidateProfile } from "@/types/job";

const RESUME = `Senior Data Engineer, Rideau Bank (Mar 2019 - Present)
- Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse.
- Cut nightly load time by 40% by rewriting Python jobs.
Skills: Python, SQL, Azure`;

const profile: CandidateProfile = {
  summary: "Senior data engineer.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: { languages: ["Python", "SQL"], frameworks: [], cloudData: ["Azure", "Azure Data Factory", "Snowflake", "Databricks", "ETL", "Data warehousing"], tools: ["Power BI"] },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: [],
  source: "heuristic",
};

const job = {
  title: "Senior Data Engineer",
  description: `Responsibilities:
- Build ETL data pipelines on Azure Data Factory and Databricks and load a Snowflake data warehouse.
- Deliver Power BI dashboards.
Requirements:
- Python, SQL and Terraform
- Strong stakeholder communication`,
};

describe("practice prompts from the rules", () => {
  const set = buildPracticeSet(job, profile, RESUME, "Technical");

  it("asks about experience for a skill you have", () => {
    expect(set.technical.some((q) => /how you have used Azure Data Factory/.test(q))).toBe(true);
  });

  it("asks how you would get up to speed for a skill you lack, never about experience you do not have", () => {
    const terraform = set.technical.find((q) => q.includes("Terraform"))!;
    expect(terraform).toMatch(/not on your profile/);
    expect(terraform).toMatch(/become productive/);
    expect(terraform).not.toMatch(/how you have used/);
  });

  it("draws role questions from the work the posting describes", () => {
    expect(set.roleSpecific.some((q) => /incremental data pipeline/.test(q))).toBe(true);
  });

  it("adapts the behavioural prompts to the interview stage", () => {
    expect(buildPracticeSet(job, profile, RESUME, "Recruiter screen").behavioural.join(" ")).toMatch(/salary expectations/);
    expect(buildPracticeSet(job, profile, RESUME, "Final").behavioural.join(" ")).toMatch(/choose you/);
    expect(set.behavioural.join(" ")).not.toMatch(/salary expectations/);
  });

  it("offers real resume lines as the basis for stories", () => {
    expect(set.stories.length).toBeGreaterThan(0);
    for (const s of set.stories) expect(RESUME).toContain(s.line);
  });

  it("gives answer structures, including one for a gap", () => {
    expect(set.structures.map((s) => s.name).join(" ")).toMatch(/gap in your experience/);
  });

  it("asks about the missing skill among the questions for the employer, and lists it as a gap to prepare", () => {
    expect(set.questionsToAsk.join(" ")).toMatch(/How important is Terraform/);
    expect(set.topicsToReview.join(" ")).toMatch(/Terraform \(a gap to prepare for\)/);
  });

  it("never promises what will be asked, and says so", () => {
    const all = JSON.stringify(set);
    expect(all).not.toMatch(/guarantee|will definitely|you will be asked/i);
    expect(PREP_DISCLAIMER).toMatch(/not a prediction/);
  });

  it("still works with no profile or resume", () => {
    const bare = buildPracticeSet(job, null, null, "Technical");
    expect(bare.technical.length).toBeGreaterThan(0);
    expect(bare.stories).toEqual([]);
  });
});

describe("checking Claude's practice set", () => {
  const raw: AiPrep = {
    technical: ["Explain partitioning in Spark.", "This will definitely be asked: describe ETL.", "Explain partitioning in Spark."],
    behavioural: ["Tell me about a conflict you resolved."],
    roleSpecific: ["How would you model claims data?"],
    answerOutlines: [
      { question: "Tell me about a pipeline you built.", outline: ["Context", "Your design", "The result"], evidence: "Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse." },
      { question: "Tell me about leading a team.", outline: ["Context", "Action"], evidence: "Led 200 engineers at Google." },
      { question: "A question with no steps.", outline: [], evidence: "" },
      { question: "You will be asked about Kafka.", outline: ["Step"], evidence: "" },
    ],
    questionsToAsk: ["How is success measured?"],
    topicsToReview: ["Snowflake", "Terraform basics"],
  };
  const out = verifyPrep(raw, RESUME);

  it("removes promises, duplicates and empty items", () => {
    expect(out.technical).toEqual(["Explain partitioning in Spark."]);
  });
  it("keeps an outline's resume line only if it is on the resume, and the outline either way", () => {
    expect(out.answerOutlines).toHaveLength(2);
    expect(out.answerOutlines[0].evidence).toMatch(/^Built ETL data pipelines/);
    expect(out.answerOutlines[1].evidence).toBe("");
  });
  it("drops an outline with no steps and one worded as a promise", () => {
    expect(out.answerOutlines.map((o) => o.question)).toEqual(["Tell me about a pipeline you built.", "Tell me about leading a team."]);
  });
});

const callStructured = vi.fn();
const isAiConfigured = vi.fn(() => true);
vi.mock("@/lib/anthropic", () => ({
  callStructured: (...a: unknown[]) => callStructured(...a),
  describeAiError: () => "Claude could not be reached.",
  isAiConfigured: () => isAiConfigured(),
}));

describe("interview prep route", () => {
  let n = 0;
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/interview-prep/route");
    return POST(new Request("http://localhost/api/interview-prep", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.3.0.${++n}` }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  };
  const valid = { job: { title: "Data Engineer", company: "Acme", location: "Ottawa, ON", workMode: "Hybrid", description: "Requirements:\n- Python" }, resumeText: RESUME, profile, stage: "Technical", format: "Video" };

  beforeEach(() => {
    callStructured.mockReset();
    isAiConfigured.mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("says so when Claude is not connected", async () => {
    isAiConfigured.mockReturnValue(false);
    expect((await post(valid)).status).toBe(503);
    expect(callStructured).not.toHaveBeenCalled();
  });
  it("rejects malformed input and an unknown stage", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ ...valid, stage: "Coffee chat" })).status).toBe(400);
  });
  it("returns only the checked prep and tells Claude not to promise anything", async () => {
    callStructured.mockResolvedValue({ model: "m", data: { technical: ["You will be asked about Kafka.", "Explain partitioning."], behavioural: [], roleSpecific: [], answerOutlines: [], questionsToAsk: [], topicsToReview: [] } });
    const body = await (await post(valid)).json();
    expect(body.prep.technical).toEqual(["Explain partitioning."]);
    expect((callStructured.mock.calls[0][0] as { system: string }).system).toMatch(/Never say or imply that any question will be asked/);
  });
  it("reports a failure plainly", async () => {
    callStructured.mockRejectedValue(new Error("boom"));
    const res = await post(valid);
    expect(res.status).toBe(502);
  });
});
