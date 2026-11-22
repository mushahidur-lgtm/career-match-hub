import { describe, expect, it, vi } from "vitest";
import { buildPrepSummary, adviseResume } from "@/lib/resume-help";
import { rewriteIsSafe, verifyInsights, type RawInsights } from "@/lib/insights";
import { scoreJob } from "@/lib/matching/engine";
import type { CandidateProfile } from "@/types/job";
import { makeJob } from "./helpers";

const RESUME = `Jordan Lee
Experience
Senior Data Engineer, Rideau Bank (Mar 2019 - Present)
- Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank.
- Modelled star schemas and delivered Power BI dashboards to finance stakeholders.
- Cut nightly load time by 40% by rewriting Python jobs.
Data Analyst, Capital Insurance (Jun 2015 - Feb 2019)
- Wrote SQL Server and SSIS reporting for insurance claims.
Projects
- Open-source Airflow DAG library for data quality checks used by three teams.
Skills: Python, SQL, Azure, Snowflake, Databricks, Power BI, Git, Docker`;

const profile: CandidateProfile = {
  summary: "Senior data engineer.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: {
    languages: ["Python", "SQL"],
    frameworks: [],
    cloudData: ["Azure", "Azure Data Factory", "Snowflake", "Databricks", "SQL Server", "Kubernetes", "Apache Spark"],
    tools: ["Power BI", "Git", "Docker"],
  },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: ["Senior Data Engineer"],
  source: "heuristic",
};

const job = makeJob({
  title: "Senior Data Engineer",
  description: `Responsibilities:
- Build ETL data pipelines on Azure Data Factory and Databricks.
- Load a Snowflake warehouse and support Power BI dashboards.
Requirements:
- 5+ years of experience
- Python, SQL and Terraform
Nice to have:
- Apache Spark
- Kubernetes`,
});

describe("rule-based resume advice", () => {
  const advice = adviseResume(job, profile, RESUME);

  it("leads with real resume lines that speak to the job, strongest first", () => {
    expect(advice.leadWith.length).toBeGreaterThan(0);
    for (const l of advice.leadWith) expect(RESUME).toContain(l.line);
    expect(advice.leadWith[0].line).toMatch(/ETL data pipelines/);
    expect(advice.leadWith[0].why).toMatch(/Azure Data Factory|Databricks|Snowflake/);
  });

  it("does not lead with skill lists or job headings", () => {
    expect(advice.leadWith.some((l) => /^Skills:/.test(l.line) || /Rideau Bank \(/.test(l.line))).toBe(false);
  });

  it("flags relevant lines that state no result, and not lines that do", () => {
    expect(advice.weakBullets.every((w) => !/40%/.test(w.line))).toBe(true);
    expect(advice.weakBullets.length).toBeGreaterThan(0);
    expect(advice.weakBullets[0].note).toMatch(/Do not guess/);
  });

  it("suggests naming skills that are on the profile but never written in the resume", () => {
    const names = advice.keywordsToAdd.map((k) => k.keyword);
    expect(names).toContain("Apache Spark");
    expect(names).toContain("Kubernetes");
    expect(names).not.toContain("Python");
  });

  it("states gaps plainly and never suggests adding a skill that is not on the profile", () => {
    const terraform = advice.gaps.find((g) => g.skill === "Terraform");
    expect(terraform?.kind).toBe("missing");
    expect(terraform?.note).toMatch(/only if you have real experience/);
    expect(advice.keywordsToAdd.map((k) => k.keyword)).not.toContain("Terraform");
  });

  it("offers projects from the projects section that fit the job", () => {
    const p = adviseResume(job, profile, RESUME).projects;
    expect(p.every((x) => RESUME.includes(x))).toBe(true);
  });

  it("uses the match's related skills and experience gaps", () => {
    const m = scoreJob(job, { profile, resumeText: RESUME });
    const a = adviseResume(job, profile, RESUME, m.detail);
    const withRelated = a.gaps.filter((g) => g.kind === "related");
    for (const g of withRelated) expect(g.note).toMatch(/related experience rather than claiming/);
  });

  it("says what is missing when there is no resume text, and invents nothing", () => {
    const a = adviseResume(job, profile, null);
    expect(a.leadWith).toEqual([]);
    expect(a.keywordsToAdd).toEqual([]);
    expect(a.notes.join(" ")).toMatch(/Add your resume text/);
  });
});

describe("preparation summary from the rules", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const scored = { ...job, match: scoreJob(job, { profile, resumeText: RESUME, preferences: { locations: ["Toronto, ON"], minSalary: 100_000 } }) };
  const advice = adviseResume(scored, profile, RESUME, scored.match.detail);

  it("explains the fit and lists real lines to lead with", () => {
    const s = buildPrepSummary(scored, advice, now);
    expect(s.whyApply).toBe(scored.match.detail!.explanation);
    for (const l of s.leadWith) expect(RESUME).toContain(l);
  });

  it("asks you to confirm an old posting is still open", () => {
    const old = { ...scored, postedAt: new Date(now.getTime() - 50 * 86_400_000).toISOString() };
    const s = buildPrepSummary(old, advice, now);
    expect(s.confirmFirst.join(" ")).toMatch(/may no longer be open/);
    expect(s.checklist.join(" ")).toMatch(/Confirm the posting is still open/);
  });

  it("flags a missing posting date and a missing salary instead of assuming", () => {
    const s = buildPrepSummary({ ...scored, postedAt: null, salary: null }, advice, now);
    expect(s.confirmFirst.join(" ")).toMatch(/no date/);
    expect(s.confirmFirst.join(" ")).toMatch(/No salary is stated/);
  });

  it("tells you to be ready to say so about a skill you lack", () => {
    const s = buildPrepSummary(scored, advice, now);
    expect(s.beReadyFor.join(" ")).toMatch(/Terraform/);
  });
});

describe("checking Claude's rewrites", () => {
  const original = "Cut nightly load time by 40% by rewriting Python jobs.";

  it("accepts a rewording that keeps every fact", () => {
    expect(rewriteIsSafe(original, "Rewrote Python jobs to cut nightly load time by 40%.")).toBe(true);
  });
  it("rejects a rewrite that adds a skill the candidate has not claimed", () => {
    expect(rewriteIsSafe(original, "Cut nightly load time by 40% by rewriting Python jobs on Terraform-managed infrastructure.")).toBe(false);
  });
  it("rejects a skill that is on the profile but was not in the original line", () => {
    // Databricks is a real skill of the candidate, but attaching it to this accomplishment would invent a fact.
    expect(rewriteIsSafe(original, "Cut nightly load time by 40% by rewriting Python jobs on Databricks.")).toBe(false);
  });
  it("accepts a skill the original line already names, in another spelling", () => {
    expect(rewriteIsSafe("Built dashboards in PowerBI.", "Built Power BI dashboards.")).toBe(true);
  });
  it("rejects a new number, percentage or amount", () => {
    expect(rewriteIsSafe(original, "Cut nightly load time by 65% by rewriting Python jobs.")).toBe(false);
    expect(rewriteIsSafe("Delivered Power BI dashboards.", "Delivered 25 Power BI dashboards.")).toBe(false);
  });
  it("accepts a placeholder instead of an invented figure", () => {
    expect(rewriteIsSafe("Delivered Power BI dashboards.", "Delivered Power BI dashboards to [number] stakeholders.")).toBe(true);
  });
  it("rejects an unchanged or trivial rewrite", () => {
    expect(rewriteIsSafe(original, original)).toBe(false);
    expect(rewriteIsSafe(original, "Ok.")).toBe(false);
  });
});

describe("checking everything Claude returns", () => {
  const raw: RawInsights = {
    rewrites: [
      { original: "Cut nightly load time by 40% by rewriting Python jobs.", suggestion: "Rewrote Python jobs to cut nightly load time by 40%.", why: "Leads with the action." },
      { original: "Led a team of 30 engineers at Google.", suggestion: "Led 30 engineers at Google.", why: "invented line" },
      { original: "Cut nightly load time by 40% by rewriting Python jobs.", suggestion: "Cut load time by 90% with Terraform.", why: "invented number and skill" },
    ],
    projects: [
      { line: "Open-source Airflow DAG library for data quality checks used by three teams.", why: "Shows data quality work." },
      { line: "Built a self-driving car.", why: "invented" },
    ],
    summary: {
      fit: "Strong fit. The main risk is Terraform.",
      talkingPoints: [
        { point: "You already run pipelines on this stack.", evidence: "Built ETL data pipelines in Azure Data Factory and Databricks that load a Snowflake warehouse for a retail bank." },
        { point: "You managed a large team.", evidence: "Managed 200 people at Amazon." },
      ],
      honestFraming: ["Terraform is not on your resume. Say so and point to Azure DevOps.", "Terraform is not on your resume. Say so and point to Azure DevOps."],
      questionsToAsk: ["How is the data platform owned?"],
      checklist: ["Lead with the pipeline line."],
    },
  };
  const out = verifyInsights(raw, RESUME);

  it("keeps only rewrites of real lines that add no skill or number", () => {
    expect(out.rewrites).toHaveLength(1);
    expect(out.rewrites[0].original).toBe("Cut nightly load time by 40% by rewriting Python jobs.");
  });
  it("keeps only projects that are on the resume", () => {
    expect(out.projects.map((p) => p.line)).toEqual(["Open-source Airflow DAG library for data quality checks used by three teams."]);
  });
  it("keeps a talking point only if its evidence is a real resume line", () => {
    expect(out.summary.talkingPoints).toHaveLength(1);
    expect(out.summary.talkingPoints[0].point).toMatch(/run pipelines/);
  });
  it("cleans and de-duplicates the plain advice", () => {
    expect(out.summary.honestFraming).toHaveLength(1);
    expect(out.summary.questionsToAsk).toHaveLength(1);
  });
  it("does not touch the input", () => {
    expect(raw.rewrites).toHaveLength(3);
    vi.restoreAllMocks();
  });
});
