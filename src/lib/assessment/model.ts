import { z } from "zod";
import { scoreJob, verifyQuotes, type MatchInput, type MatchableJob } from "@/lib/matching/engine";
import type { Confidence, EligibilityCheck, EligibilityStatus, MatchResult } from "@/types/job";

/**
 * The detailed assessment of one job. Skills, qualifications and eligibility come from the rules. Claude adds
 * the judgement about experience and duties, and interview preparation. It gives no score and cannot change
 * eligibility, and anything it quotes is checked against the resume or the posting.
 */

export const RECOMMENDATIONS = ["strongly_recommend", "apply_after_gaps", "career_transition", "low_priority", "not_eligible"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  strongly_recommend: "Strongly recommend applying",
  apply_after_gaps: "Apply after addressing gaps",
  career_transition: "Possible career transition",
  low_priority: "Low priority",
  not_eligible: "Not eligible",
};

const str = (n: number) => z.string().max(n);

/** What Claude must return. Lengths and counts are trimmed afterwards, so the model is not asked to count. */
export const ModelAnswerSchema = z.object({
  summary: z.string(),
  recommendation: z.enum(RECOMMENDATIONS),
  reasons: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  caveats: z.array(z.string()),
  professionalExperience: z.array(z.object({ point: z.string(), evidence: z.string().describe("A resume line copied exactly.") })),
  projectExperience: z.array(z.object({ point: z.string(), evidence: z.string().describe("A resume line copied exactly.") })),
  experienceGaps: z.array(z.string()),
  seniority: z.string(),
  responsibilities: z.array(
    z.object({
      duty: z.string().describe("A duty copied exactly from the posting."),
      evidence: z.string().describe("The resume line showing the candidate has done this, copied exactly. Empty if none."),
      alignment: z.enum(["demonstrated", "partial", "not_shown"]),
    }),
  ),
  technicalTopics: z.array(z.string()),
  experienceQuestions: z.array(z.string()),
  skillsToRevise: z.array(z.string()),
  examples: z.array(z.object({ suggestion: z.string(), evidence: z.string().describe("The resume line the example comes from, copied exactly.") })),
});
export type ModelAnswer = z.infer<typeof ModelAnswerSchema>;

const quoted = z.object({ point: str(500), evidence: str(400) });

export const AiSectionSchema = z.object({
  summary: str(900),
  recommendation: z.enum(RECOMMENDATIONS),
  reasons: z.array(str(400)).max(5),
  confidence: z.enum(["high", "medium", "low"]),
  caveats: z.array(str(400)).max(5),
  professionalExperience: z.array(quoted).max(5),
  projectExperience: z.array(quoted).max(4),
  experienceGaps: z.array(str(400)).max(6),
  seniority: str(400),
  responsibilities: z.array(z.object({ duty: str(400), evidence: str(400), alignment: z.enum(["demonstrated", "partial", "not_shown"]) })).max(8),
  interview: z.object({
    technicalTopics: z.array(str(300)).max(3),
    experienceQuestions: z.array(str(400)).max(3),
    skillsToRevise: z.array(str(120)).max(6),
    examples: z.array(quoted).max(4),
  }),
});
export type AiSection = z.infer<typeof AiSectionSchema>;

export interface RuleSection {
  score: number;
  confidence: Confidence;
  eligibility: EligibilityStatus;
  postingClosed: boolean;
  requiredMatched: string[];
  /** Every required skill not on the resume, including those a related skill partly covers. */
  requiredMissing: string[];
  preferredMatched: string[];
  transferable: { skill: string; via: string; why: string }[];
  /** Skills the resume supports only by study or personal projects, or merely lists. */
  weaklyShown: { skill: string; level: string }[];
  qualifications: EligibilityCheck[];
  otherConditions: EligibilityCheck[];
  recommendation: Recommendation;
}

export interface Assessment {
  status: "complete" | "unavailable" | "failed";
  rules: RuleSection;
  ai: AiSection | null;
  /** Why there is no AI part, or how its answer was corrected. */
  notes: string[];
  at: string;
  model: string | null;
}

const QUALIFICATION_GATES = ["education", "certification"];

export const requiredNotHeld = (match: MatchResult): string[] => {
  const d = match.detail!;
  const matched = new Set(d.requiredMatched);
  return (d.skillEvidence ?? []).filter((s) => s.importance === "required" && !matched.has(s.skill)).map((s) => s.skill);
};

export function rulesRecommendation(match: MatchResult): Recommendation {
  const d = match.detail!;
  if (match.eligibility?.status === "not_eligible") return "not_eligible";
  if (match.postingStatus === "expired") return "low_priority";
  // A strong recommendation also needs every required skill to be one you actually have.
  if (match.score >= 75 && d.confidence !== "low" && match.eligibility?.status !== "needs_verification" && !requiredNotHeld(match).length) return "strongly_recommend";
  if (d.careerAlignment?.relation === "transition" && match.score >= 40) return "career_transition";
  return match.score >= 55 ? "apply_after_gaps" : "low_priority";
}

export function ruleSection(job: MatchableJob, input: MatchInput): RuleSection {
  const match = scoreJob(job, input);
  const d = match.detail!;
  const checks = match.eligibility!.checks;
  return {
    score: match.score,
    confidence: d.confidence,
    eligibility: match.eligibility!.status,
    postingClosed: match.postingStatus === "expired",
    requiredMatched: d.requiredMatched,
    requiredMissing: requiredNotHeld(match),
    preferredMatched: d.preferredMatched,
    transferable: d.transferable.map((t) => ({ skill: t.skill, via: t.via, why: t.why ?? "" })),
    weaklyShown: (d.skillEvidence ?? []).filter((s) => !s.via && (s.level === "project" || s.level === "learning" || s.level === "listed")).map((s) => ({ skill: s.skill, level: s.level })),
    qualifications: checks.filter((c) => QUALIFICATION_GATES.includes(c.gate)),
    otherConditions: checks.filter((c) => !QUALIFICATION_GATES.includes(c.gate)),
    recommendation: rulesRecommendation(match),
  };
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const list = (items: string[], count: number, n = 400) => items.map((s) => clip(s, n)).filter(Boolean).slice(0, count);

/** Turns Claude's answer into what may be shown: unsupported claims are dropped and limits enforced. */
export function verifyAnswer(raw: ModelAnswer, resumeText: string, posting: string, rules: RuleSection): { ai: AiSection; notes: string[] } {
  const notes: string[] = [];
  const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const inPosting = (s: string) => squash(s).length >= 12 && squash(posting).includes(squash(s));
  const quote = (s: string) => verifyQuotes([s], resumeText)[0] ?? "";
  let dropped = 0;
  const supported = (items: { evidence: string; text: string }[], count: number) =>
    items
      .map((i) => ({ point: clip(i.text, 500), evidence: quote(i.evidence) }))
      .filter((i) => {
        if (i.point && i.evidence) return true;
        dropped += 1;
        return false;
      })
      .slice(0, count);

  const responsibilities = raw.responsibilities
    .filter((r) => inPosting(r.duty))
    .slice(0, 8)
    .map((r) => {
      const evidence = quote(r.evidence);
      return { duty: clip(r.duty, 400), evidence, alignment: evidence ? r.alignment : ("not_shown" as const) };
    });

  // The rules decide eligibility, and Claude may not recommend more strongly than they allow.
  let recommendation = raw.recommendation;
  if (rules.eligibility === "not_eligible") recommendation = "not_eligible";
  else if (rules.postingClosed) recommendation = "low_priority";
  else if (recommendation === "not_eligible") recommendation = rules.recommendation;
  else if (recommendation === "strongly_recommend" && rules.recommendation !== "strongly_recommend") recommendation = rules.recommendation;
  if (recommendation !== raw.recommendation) notes.push("The recommendation was brought in line with the eligibility, posting and score checks.");

  const ai: AiSection = {
    summary: clip(raw.summary, 900),
    recommendation,
    reasons: list(raw.reasons, 5),
    confidence: raw.confidence,
    caveats: list(raw.caveats, 5),
    professionalExperience: supported(raw.professionalExperience.map((p) => ({ text: p.point, evidence: p.evidence })), 5),
    projectExperience: supported(raw.projectExperience.map((p) => ({ text: p.point, evidence: p.evidence })), 4),
    experienceGaps: list(raw.experienceGaps, 6),
    seniority: clip(raw.seniority, 400),
    responsibilities,
    interview: {
      technicalTopics: list(raw.technicalTopics, 3, 300),
      experienceQuestions: list(raw.experienceQuestions, 3),
      skillsToRevise: list(raw.skillsToRevise, 6, 120),
      examples: supported(raw.examples.map((e) => ({ text: e.suggestion, evidence: e.evidence })), 4),
    },
  };
  if (dropped) notes.push(`${dropped} statement${dropped === 1 ? " was" : "s were"} removed because no matching resume line could be found.`);
  return { ai, notes };
}
