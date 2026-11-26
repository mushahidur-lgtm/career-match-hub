/**
 * The matching benchmark. These tests check that the framework measures correctly and that a few hard rules
 * hold. They deliberately do not pin today's metric values: disagreements are reported, not hidden.
 *
 * `npm run benchmark` writes docs/benchmark-report.md.
 * `npm run benchmark -- --backup <exported backup.json>` evaluates your own profile into benchmark-output/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup";
import { computeMetrics, evaluateCandidate, type Outcome } from "@/lib/benchmark/evaluate";
import { buildReport } from "@/lib/benchmark/report";
import type { Scenario } from "@/lib/benchmark/types";
import { toMatchInput } from "@/lib/search/match-input";
import { ANALYST_SCENARIOS } from "./fixtures/benchmark/analyst-scenarios";
import { CANDIDATES } from "./fixtures/benchmark/candidates";
import { DEVELOPER_SCENARIOS } from "./fixtures/benchmark/developer-scenarios";

const SCENARIOS: Scenario[] = [...ANALYST_SCENARIOS, ...DEVELOPER_SCENARIOS];
const run = () => CANDIDATES.map((c) => evaluateCandidate(c, SCENARIOS));
const find = (groups: Outcome[][], id: string) => groups.flat().find((o) => o.scenario.id === id)!;

describe("benchmark set", () => {
  it("has at least 30 scenarios with unique ids, all eight categories and all sixteen cases", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(new Set(SCENARIOS.map((s) => s.category)).size).toBe(8);
    expect(new Set(SCENARIOS.map((s) => s.kind)).size).toBe(16);
  });
  it("is deterministic and does not depend on the order of the scenarios", () => {
    const forward = run().flat().map((o) => [o.scenario.id, o.score, o.rank]);
    const reversed = CANDIDATES.map((c) => evaluateCandidate(c, [...SCENARIOS].reverse())).flat().map((o) => [o.scenario.id, o.score, o.rank]);
    expect(reversed.sort()).toEqual(forward.sort());
  });
});

describe("rules the benchmark must never break", () => {
  const groups = run();
  it("never recommends a job with a confirmed eligibility mismatch or a closed posting", () => {
    for (const id of ["an-11", "dv-12", "an-15", "dv-18"]) expect(find(groups, id)).toMatchObject({ predicted: "no", rank: null });
  });
  it("tells professional Data Engineer and BI experience from study and personal projects", () => {
    const level = (id: string, skill: string) => find(groups, id).match.detail!.skillEvidence!.find((e) => e.skill === skill)!.level;
    expect(level("an-01", "Power BI")).toBe("professional");
    expect(level("an-03", "Python")).toBe("project");
    expect(level("an-03", "PySpark")).toBe("learning");
    expect(find(groups, "an-01").score).toBeGreaterThan(find(groups, "an-03").score);
    expect(find(groups, "an-03").predicted).not.toBe("apply");
  });
  it("does not report a related technology as the skill itself", () => {
    const m = find(groups, "an-04").match.detail!;
    expect(m.requiredMatched).not.toContain("Azure Data Factory");
    expect(m.requiredMatched).not.toContain("Azure SQL");
  });
});

describe("metric arithmetic", () => {
  const fake = (id: string, tier: "apply" | "consider" | "no", rank: number | null, predicted: "apply" | "consider" | "no"): Outcome => ({
    scenario: { ...SCENARIOS[0], id, expect: { tier, eligibility: "not_applicable", required: ["SQL"] } },
    match: { score: 50, eligibility: { status: "not_applicable", checks: [], reason: "" }, detail: { confidence: "high", requiredMatched: [], preferredMatched: [], skillEvidence: [], gaps: [] } } as never,
    score: 50,
    rank,
    predicted,
    extracted: ["SQL", "Python"],
  });
  const m = computeMetrics([[fake("a", "apply", 1, "apply"), fake("b", "no", 2, "apply"), fake("c", "apply", 3, "consider"), fake("d", "no", null, "no")]]);

  it("computes precision, recall and error rates", () => {
    expect(m.precisionAt5).toEqual({ hit: 2, of: 3, value: 2 / 3 });
    expect(m.recall.value).toBe(0.5);
    expect(m.falsePositiveRate.value).toBe(0.5);
    expect(m.falseNegativeRate.value).toBe(0.5);
  });
  it("computes ranking consistency over differently labelled pairs only", () => {
    // Pairs: a>b right, a>d right, c>b wrong, c>d right.
    expect(m.rankingConsistency).toEqual({ hit: 3, of: 4, value: 0.75 });
  });
  it("computes extraction precision and recall", () => {
    expect(m.extractionPrecision.value).toBe(0.5);
    expect(m.extractionRecall.value).toBe(1);
  });
  it("reports nothing to measure as null, not zero", () => {
    expect(computeMetrics([[]]).precisionAt5.value).toBeNull();
  });
});

describe("report", () => {
  it("writes the report when asked", () => {
    const text = buildReport(run(), "Matching benchmark", "Two invented candidates. Fixtures: `tests/fixtures/benchmark/`.");
    expect(text).toContain("Precision@5");
    expect(text).toContain("not** a measure of production performance");
    if (process.env.CMH_BENCH_REPORT) writeFileSync(process.env.CMH_BENCH_REPORT, text);
  });

  it.runIf(process.env.CMH_BENCH_BACKUP)("scores the profile from an exported backup, locally only", () => {
    const parsed = parseBackup(readFileSync(process.env.CMH_BENCH_BACKUP!, "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { resumes, activeResumeId, preferences } = parsed.data;
    const resume = resumes.find((r) => r.id === activeResumeId) ?? resumes[0];
    expect(resume, "the backup holds no resume").toBeTruthy();
    const input = { ...toMatchInput(resume.profile, resume.text, preferences), resumeText: resume.text };
    // Your profile against every posting. The labels were written for other candidates, so only the engine's own findings are listed.
    const rows = evaluateCandidate({ id: "analyst", label: "you", input }, SCENARIOS.map((s) => ({ ...s, candidate: "analyst" })))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .map((o) => {
        const e = o.match.detail!.skillEvidence!.map((s) => `${s.skill}=${s.level}${s.via ? ` via ${s.via}` : ""}`).join(", ");
        return `| ${o.rank ?? "excluded"} | ${o.scenario.id} | ${o.scenario.title} | ${o.score} | ${o.predicted} | ${e} |`;
      });
    mkdirSync("benchmark-output", { recursive: true });
    writeFileSync("benchmark-output/candidate-report.md", `# Your profile against the benchmark postings\n\nContains details from your resume. Do not commit it.\n\n| Rank | Id | Title | Score | Verdict | Evidence |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  });
});
