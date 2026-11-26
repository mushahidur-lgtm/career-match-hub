import { describeRequirements, scoreJob, type MatchableJob } from "@/lib/matching/engine";
import { compareByFit, rankTier } from "@/lib/search/rank";
import { canonicalSkill } from "@/lib/skills";
import type { Confidence, EligibilityStatus, MatchResult, RecommendedAction } from "@/types/job";
import type { BenchCandidate, Scenario, Tier } from "./types";

/** Runs the engine over labelled scenarios and compares what it says with the labels. No AI is involved. */

export interface Outcome {
  scenario: Scenario;
  match: MatchResult;
  score: number;
  /** Position among this candidate's recommendable jobs, 1 first. Null when excluded. */
  rank: number | null;
  predicted: Tier;
  extracted: string[];
}

export const jobOf = (s: Scenario): MatchableJob => ({
  title: s.title,
  description: s.description,
  location: s.location ?? "Toronto, ON",
  workMode: s.workMode ?? "Hybrid",
  salary: null,
  descriptionTruncated: s.truncated ?? false,
});

const PREDICTED: Record<RecommendedAction, Tier> = {
  strong_match: "apply",
  consider: "consider",
  upskill: "consider",
  verify_requirements: "consider",
  not_recommended: "no",
};

export function evaluateCandidate(candidate: BenchCandidate, scenarios: Scenario[]): Outcome[] {
  const own = scenarios.filter((s) => s.candidate === candidate.id);
  const outcomes: Outcome[] = own.map((scenario) => {
    const match = scoreJob(jobOf(scenario), { ...candidate.input, facts: { ...candidate.input.facts, ...scenario.facts } });
    const excluded = rankTier({ match }) === 2;
    return {
      scenario,
      match,
      score: match.score,
      rank: null,
      predicted: excluded ? "no" : PREDICTED[match.recommendedAction!],
      extracted: describeRequirements(scenario.title, scenario.description).required,
    };
  });
  // The order a person would see: excluded jobs are not in the list at all.
  outcomes
    .filter((o) => rankTier({ match: o.match }) < 2)
    .sort((a, b) => compareByFit({ match: a.match }, { match: b.match }) || a.scenario.id.localeCompare(b.scenario.id))
    .forEach((o, i) => (o.rank = i + 1));
  return outcomes;
}

/* ---------- metrics ---------- */

export interface Ratio {
  hit: number;
  of: number;
  /** hit / of, or null when there was nothing to measure. */
  value: number | null;
}
const ratio = (hit: number, of: number): Ratio => ({ hit, of, value: of ? hit / of : null });

const lower = (skills: string[]) => new Set(skills.map((s) => canonicalSkill(s).toLowerCase()));

export interface Metrics {
  scenarios: number;
  precisionAt5: Ratio;
  precisionAt10: Ratio;
  /** The most precision@10 could be, given how many "apply" jobs there are. */
  precisionAt10Ceiling: Ratio;
  recall: Ratio;
  rankingConsistency: Ratio;
  falsePositiveRate: Ratio;
  falseNegativeRate: Ratio;
  tierAgreement: Ratio;
  extractionPrecision: Ratio;
  extractionRecall: Ratio;
  eligibilityAccuracy: Ratio;
  evidenceAccuracy: Ratio;
  wronglyMatched: Ratio;
  missingQualificationsReported: Ratio;
  calibration: Record<Confidence, Ratio>;
}

const sum = (rs: Ratio[]) => ratio(rs.reduce((n, r) => n + r.hit, 0), rs.reduce((n, r) => n + r.of, 0));

function precisionAt(outcomes: Outcome[], k: number): Ratio {
  const top = outcomes.filter((o) => o.rank !== null && o.rank <= k);
  return ratio(top.filter((o) => o.scenario.expect.tier === "apply").length, top.length);
}

const TIER_RANK: Record<Tier, number> = { apply: 2, consider: 1, no: 0 };

/** Of every pair of jobs the labels order, how many the engine orders the same way. Ties count half. */
function concordance(outcomes: Outcome[]): Ratio {
  const place = (o: Outcome) => o.rank ?? Number.MAX_SAFE_INTEGER;
  let hit = 0;
  let of = 0;
  for (let i = 0; i < outcomes.length; i++) {
    for (let j = i + 1; j < outcomes.length; j++) {
      const [a, b] = [outcomes[i], outcomes[j]];
      const want = TIER_RANK[a.scenario.expect.tier] - TIER_RANK[b.scenario.expect.tier];
      if (!want) continue;
      of += 1;
      const got = place(b) - place(a);
      hit += got === 0 ? 0.5 : Math.sign(got) === Math.sign(want) ? 1 : 0;
    }
  }
  return ratio(hit, of);
}

export const qualificationReported = (o: Outcome, name: string): boolean =>
  [...(o.match.eligibility?.checks ?? []).filter((c) => c.status !== "eligible").map((c) => `${c.note} ${c.postingEvidence}`), ...(o.match.detail?.gaps ?? []).map((g) => `${g.text} ${g.evidence.join(" ")}`)]
    .join(" ")
    .toLowerCase()
    .includes(name.toLowerCase());

export function wronglyMatchedSkills(o: Outcome): string[] {
  const matched = lower([...(o.match.detail?.requiredMatched ?? []), ...(o.match.detail?.preferredMatched ?? [])]);
  return (o.scenario.expect.notMatched ?? []).filter((s) => matched.has(canonicalSkill(s).toLowerCase()));
}

export function evidenceErrors(o: Outcome): { skill: string; expected: string; got: string }[] {
  const got = new Map((o.match.detail?.skillEvidence ?? []).map((e) => [e.skill.toLowerCase(), e.level]));
  return Object.entries(o.scenario.expect.evidence ?? {})
    .map(([skill, expected]) => ({ skill, expected: expected as string, got: (got.get(canonicalSkill(skill).toLowerCase()) ?? "not read") as string }))
    .filter((x) => x.expected !== x.got);
}

export const eligibilityMismatch = (o: Outcome): { expected: EligibilityStatus; got: EligibilityStatus } | null =>
  o.match.eligibility!.status === o.scenario.expect.eligibility ? null : { expected: o.scenario.expect.eligibility, got: o.match.eligibility!.status };

/** `groups` holds one candidate's outcomes each: ranking figures only make sense within a candidate. */
export function computeMetrics(groups: Outcome[][]): Metrics {
  const all = groups.flat();
  const apply = all.filter((o) => o.scenario.expect.tier === "apply");
  const no = all.filter((o) => o.scenario.expect.tier === "no");
  const found = apply.filter((o) => o.predicted === "apply").length;
  // Extraction is only scored where the posting states requirements to read.
  const labelled = all.filter((o) => o.scenario.expect.required.length);
  const hits = (o: Outcome) => {
    const want = lower(o.scenario.expect.required);
    return [...lower(o.extracted)].filter((s) => want.has(s)).length;
  };
  const withEvidence = all.filter((o) => o.scenario.expect.evidence);
  const bucket = (c: Confidence) => {
    const rows = all.filter((o) => o.match.detail!.confidence === c);
    return ratio(rows.filter((o) => o.predicted === o.scenario.expect.tier).length, rows.length);
  };
  const quals = all.flatMap((o) => (o.scenario.expect.missingQualifications ?? []).map((q) => qualificationReported(o, q)));
  const notMatched = all.reduce((n, o) => n + (o.scenario.expect.notMatched?.length ?? 0), 0);

  return {
    scenarios: all.length,
    precisionAt5: sum(groups.map((g) => precisionAt(g, 5))),
    precisionAt10: sum(groups.map((g) => precisionAt(g, 10))),
    precisionAt10Ceiling: sum(groups.map((g) => ratio(Math.min(10, g.filter((o) => o.scenario.expect.tier === "apply").length), Math.min(10, g.filter((o) => o.rank !== null).length)))),
    recall: ratio(found, apply.length),
    rankingConsistency: sum(groups.map(concordance)),
    falsePositiveRate: ratio(no.filter((o) => o.predicted === "apply").length, no.length),
    falseNegativeRate: ratio(apply.length - found, apply.length),
    tierAgreement: ratio(all.filter((o) => o.predicted === o.scenario.expect.tier).length, all.length),
    extractionPrecision: ratio(labelled.reduce((n, o) => n + hits(o), 0), labelled.reduce((n, o) => n + lower(o.extracted).size, 0)),
    extractionRecall: ratio(labelled.reduce((n, o) => n + hits(o), 0), labelled.reduce((n, o) => n + lower(o.scenario.expect.required).size, 0)),
    eligibilityAccuracy: ratio(all.filter((o) => !eligibilityMismatch(o)).length, all.length),
    evidenceAccuracy: ratio(
      withEvidence.reduce((n, o) => n + Object.keys(o.scenario.expect.evidence!).length - evidenceErrors(o).length, 0),
      withEvidence.reduce((n, o) => n + Object.keys(o.scenario.expect.evidence!).length, 0),
    ),
    wronglyMatched: ratio(all.reduce((n, o) => n + wronglyMatchedSkills(o).length, 0), notMatched),
    missingQualificationsReported: ratio(quals.filter(Boolean).length, quals.length),
    calibration: { high: bucket("high"), medium: bucket("medium"), low: bucket("low") },
  };
}
