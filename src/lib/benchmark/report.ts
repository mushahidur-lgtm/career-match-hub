import {
  computeMetrics,
  eligibilityMismatch,
  evidenceErrors,
  qualificationReported,
  wronglyMatchedSkills,
  type Outcome,
  type Ratio,
} from "./evaluate";
import type { Tier } from "./types";

const pct = (r: Ratio) => (r.value === null ? "n/a" : `${Math.round(r.value * 100)}% (${Number.isInteger(r.hit) ? r.hit : r.hit.toFixed(1)}/${r.of})`);
const name = (o: Outcome) => `${o.scenario.id} ${o.scenario.title} [${o.scenario.kind}]`;
const section = (title: string, rows: string[]) => `\n## ${title}\n\n${rows.length ? rows.map((r) => `- ${r}`).join("\n") : "None."}\n`;
const ORDER: Record<Tier, number> = { no: 0, consider: 1, apply: 2 };

export function buildReport(groups: Outcome[][], heading: string, note: string): string {
  const m = computeMetrics(groups);
  const all = groups.flat();
  const rows: [string, string][] = [
    ["Precision@5", pct(m.precisionAt5)],
    ["Precision@10", `${pct(m.precisionAt10)}; at most ${pct(m.precisionAt10Ceiling)} with these labels`],
    ["Recall of high-quality matches", pct(m.recall)],
    ["Ranking consistency (pairs ordered as labelled)", pct(m.rankingConsistency)],
    ["False-positive rate (a 'no' job called a strong match)", pct(m.falsePositiveRate)],
    ["False-negative rate (an 'apply' job not called a strong match)", pct(m.falseNegativeRate)],
    ["Tier agreement", pct(m.tierAgreement)],
    ["Required-skill extraction, precision", pct(m.extractionPrecision)],
    ["Required-skill extraction, recall", pct(m.extractionRecall)],
    ["Eligibility status accuracy", pct(m.eligibilityAccuracy)],
    ["Evidence level accuracy", pct(m.evidenceAccuracy)],
    ["Skills wrongly reported as matched", pct(m.wronglyMatched)],
    ["Missing mandatory qualifications reported", pct(m.missingQualificationsReported)],
    ["Calibration: tier agreement at high confidence", pct(m.calibration.high)],
    ["Calibration: tier agreement at medium confidence", pct(m.calibration.medium)],
    ["Calibration: tier agreement at low confidence", pct(m.calibration.low)],
  ];

  const line = (o: Outcome) => `${name(o)}: labelled ${o.scenario.expect.tier}, engine ${o.predicted} (score ${o.score}, ${o.rank === null ? "excluded" : `rank ${o.rank}`})`;
  return `# ${heading}

${note}

${m.scenarios} scenarios. Rules only, no AI. These are agreement figures against hand-written labels on a small
invented set. They are **not** a measure of production performance or of hiring outcomes.

| Metric | Value |
| --- | --- |
${rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n")}
${section("Ranked too highly", all.filter((o) => ORDER[o.predicted] > ORDER[o.scenario.expect.tier]).map(line))}${section("Ranked too low", all.filter((o) => ORDER[o.predicted] < ORDER[o.scenario.expect.tier]).map(line))}${section(
    "Skills wrongly reported as matched (including related skills treated as equivalent)",
    all.flatMap((o) => wronglyMatchedSkills(o).map((s) => `${name(o)}: ${s}`)),
  )}${section("Evidence level disagreements", all.flatMap((o) => evidenceErrors(o).map((e) => `${name(o)}: ${e.skill} expected ${e.expected}, got ${e.got}`)))}${section(
    "Missing qualifications not reported",
    all.flatMap((o) => (o.scenario.expect.missingQualifications ?? []).filter((q) => !qualificationReported(o, q)).map((q) => `${name(o)}: ${q}`)),
  )}${section("Eligibility disagreements", all.flatMap((o) => { const e = eligibilityMismatch(o); return e ? [`${name(o)}: expected ${e.expected}, got ${e.got}`] : []; }))}${section(
    "Required-skill extraction disagreements",
    all.filter((o) => o.scenario.expect.required.length).flatMap((o) => {
      const want = o.scenario.expect.required.map((s) => s.toLowerCase());
      const got = o.extracted.map((s) => s.toLowerCase());
      const missed = o.scenario.expect.required.filter((s) => !got.includes(s.toLowerCase()));
      const extra = o.extracted.filter((s) => !want.includes(s.toLowerCase()));
      return missed.length || extra.length ? [`${name(o)}:${missed.length ? ` missed ${missed.join(", ")}.` : ""}${extra.length ? ` extra ${extra.join(", ")}.` : ""}`] : [];
    }),
  )}`;
}
