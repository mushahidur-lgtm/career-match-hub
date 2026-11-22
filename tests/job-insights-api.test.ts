import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateProfile } from "@/types/job";

const callStructured = vi.fn();
const isAiConfigured = vi.fn(() => true);
vi.mock("@/lib/anthropic", () => ({
  callStructured: (...a: unknown[]) => callStructured(...a),
  describeAiError: () => "Claude could not be reached.",
  isAiConfigured: () => isAiConfigured(),
}));

const { POST } = await import("@/app/api/job-insights/route");

const RESUME = `Senior Data Engineer, Rideau Bank (Mar 2019 - Present)
- Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank.
- Cut nightly load time by 40% by rewriting Python jobs.
Skills: Python, SQL, Azure`;

const profile: CandidateProfile = {
  summary: "Senior data engineer.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: { languages: ["Python", "SQL"], frameworks: [], cloudData: ["Azure", "Azure Data Factory", "Snowflake", "Databricks"], tools: [] },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: [],
  source: "heuristic",
};
const job = { title: "Senior Data Engineer", company: "Acme", location: "Ottawa, ON", workMode: "Hybrid", description: "Requirements:\n- Python, SQL and Terraform", match: null };

let n = 0;
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/job-insights", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++n}` }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  callStructured.mockReset();
  isAiConfigured.mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("job insights route", () => {
  it("says so when Claude is not connected, without calling it", async () => {
    isAiConfigured.mockReturnValue(false);
    const res = await post({ job, resumeText: RESUME, profile });
    expect(res.status).toBe(503);
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("rejects malformed and too-short input", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ job, profile })).status).toBe(400);
    expect((await post({ job, resumeText: "hi", profile })).status).toBe(400);
  });

  it("returns only what survives checking", async () => {
    callStructured.mockResolvedValue({
      model: "m",
      data: {
        rewrites: [
          { original: "Cut nightly load time by 40% by rewriting Python jobs.", suggestion: "Rewrote Python jobs to cut nightly load time by 40%.", why: "Leads with the action." },
          { original: "Cut nightly load time by 40% by rewriting Python jobs.", suggestion: "Cut nightly load time by 80% using Terraform.", why: "invented" },
          { original: "Founded a startup.", suggestion: "Founded and sold a startup.", why: "invented" },
        ],
        projects: [{ line: "Won a Nobel prize.", why: "invented" }],
        summary: {
          fit: "Good fit.",
          talkingPoints: [
            { point: "You run this exact stack.", evidence: "Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank." },
            { point: "You lead big teams.", evidence: "Led 500 people." },
          ],
          honestFraming: ["Terraform is not on your resume."],
          questionsToAsk: [],
          checklist: ["Lead with the pipeline line."],
        },
      },
    });
    const body = await (await post({ job, resumeText: RESUME, profile })).json();
    expect(body.insights.rewrites).toHaveLength(1);
    expect(body.insights.projects).toEqual([]);
    expect(body.insights.summary.talkingPoints).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/Terraform\.|Nobel|500 people|sold a startup/);
  });

  it("sends the resume and the job to Claude with the rules it must follow", async () => {
    callStructured.mockResolvedValue({ model: "m", data: { rewrites: [], projects: [], summary: { fit: "", talkingPoints: [], honestFraming: [], questionsToAsk: [], checklist: [] } } });
    await post({ job, resumeText: RESUME, profile });
    const call = callStructured.mock.calls[0][0] as { system: string; user: string };
    expect(call.user).toContain("<resume>");
    expect(call.user).toContain("requiredSkills");
    expect(call.system).toMatch(/Never invent/);
    expect(call.system).toMatch(/copied exactly/);
  });

  it("reports a Claude failure plainly", async () => {
    callStructured.mockRejectedValue(new Error("boom"));
    const res = await post({ job, resumeText: RESUME, profile });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Claude could not be reached.");
  });
});
