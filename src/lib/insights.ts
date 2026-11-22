import { verifyQuotes } from "@/lib/matching/engine";
import { canonicalSkill, dedupe, extractSkills, flattenSkills } from "@/lib/skills";

/** What Claude suggests for one job, after checking. Everything here is safe to show. */
export interface JobInsights {
  rewrites: { original: string; suggestion: string; why: string }[];
  projects: { line: string; why: string }[];
  summary: {
    fit: string;
    talkingPoints: { point: string; evidence: string }[];
    honestFraming: string[];
    questionsToAsk: string[];
    checklist: string[];
  };
}

/** Claude's answer before checking. */
export interface RawInsights {
  rewrites: { original: string; suggestion: string; why: string }[];
  projects: { line: string; why: string }[];
  summary: {
    fit: string;
    talkingPoints: { point: string; evidence: string }[];
    honestFraming: string[];
    questionsToAsk: string[];
    checklist: string[];
  };
}

const text = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const numbers = (s: string) => (s.match(/\d[\d,.]*\s*%?/g) ?? []).map((n) => n.replace(/[\s,]/g, ""));

/**
 * A rewrite may sharpen how an existing line is worded. It may not add a skill the line did not
 * already name, or a number that is not already in it. Attaching a tool to an accomplishment it was
 * not part of would be an invented fact, even if you know that tool.
 */
export function rewriteIsSafe(original: string, suggestion: string): boolean {
  const allowed = new Set(flattenSkills(extractSkills(original)).map((s) => canonicalSkill(s).toLowerCase()));
  const introducedSkill = flattenSkills(extractSkills(suggestion)).some((s) => !allowed.has(canonicalSkill(s).toLowerCase()));
  if (introducedSkill) return false;
  const known = new Set(numbers(original));
  if (numbers(suggestion).some((n) => !known.has(n))) return false;
  return suggestion.trim().length >= 10 && suggestion.trim() !== original.trim();
}

export function verifyInsights(raw: RawInsights, resumeText: string): JobInsights {
  const rewrites = raw.rewrites
    .map((r) => ({ original: verifyQuotes([r.original], resumeText)[0] ?? "", suggestion: text(r.suggestion, 400), why: text(r.why, 250) }))
    .filter((r) => r.original && rewriteIsSafe(r.original, r.suggestion))
    .slice(0, 5);

  const projects = raw.projects
    .map((p) => ({ line: verifyQuotes([p.line], resumeText)[0] ?? "", why: text(p.why, 250) }))
    .filter((p) => p.line)
    .slice(0, 3);

  // A talking point stands only if the resume line it rests on is real.
  const talkingPoints = raw.summary.talkingPoints
    .map((t) => ({ point: text(t.point, 300), evidence: verifyQuotes([t.evidence], resumeText)[0] ?? "" }))
    .filter((t) => t.point && t.evidence)
    .slice(0, 5);

  const list = (items: string[], n: number) => dedupe(items.map((i) => text(i, 300)).filter(Boolean)).slice(0, n);

  return {
    rewrites,
    projects,
    summary: {
      fit: text(raw.summary.fit, 500),
      talkingPoints,
      honestFraming: list(raw.summary.honestFraming, 4),
      questionsToAsk: list(raw.summary.questionsToAsk, 4),
      checklist: list(raw.summary.checklist, 6),
    },
  };
}
