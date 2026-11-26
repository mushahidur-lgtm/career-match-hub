import { IMPLIED_BY, EVIDENCE_CREDIT, resumeLines, skillEvidence, type ResumeLine } from "@/lib/candidate/evidence";
import { checkEligibility } from "@/lib/eligibility/engine";
import { yearlySalary } from "@/lib/format";
import { guardPosting } from "@/lib/jobs/sanitize";
import { assessPosting } from "@/lib/jobs/status";
import { profileSkills } from "@/lib/heuristics";
import { canonicalSkill, dedupe, extractSkills, flattenSkills, skillPattern } from "@/lib/skills";
import {
  DEFAULT_MATCH_WEIGHTS,
  MATCH_COMPONENTS,
  MATCH_COMPONENT_LABELS,
  type AiReview,
  type CandidateFacts,
  type CandidateProfile,
  type EvidencedPoint,
  type Job,
  type MatchComponent,
  type MatchComponentKey,
  type MatchDetail,
  type MatchResult,
  type MatchWeights,
  type Seniority,
  type SkillMatchItem,
} from "@/types/job";
import { careerAlignment } from "./career";
import { assessConfidence } from "./confidence";
import { extractRequirements, LOW_CONFIDENCE } from "./extraction";
import { CANADA_HINTS, CONCEPTS, FOREIGN_HINTS, INDUSTRIES, REGIONS } from "./knowledge";
import { recommendedAction } from "./recommend";
import { parseRequirements } from "./requirements";
import { transfersFor } from "./transfer";

export type MatchableJob = Pick<Job, "title" | "description" | "location" | "workMode" | "salary" | "descriptionTruncated"> &
  Partial<Pick<Job, "postingStatus" | "source" | "applyUrl" | "postedAt">>;

export interface MatchInput {
  profile: CandidateProfile;
  /** The resume text. Evidence quotes are copied from it, and it is the source for responsibilities. */
  resumeText?: string | null;
  /** `roles` are the jobs the candidate is aiming for. A target role is not held back for differing from past titles. */
  preferences?: { locations: string[]; minSalary: number | null; roles?: string[]; primaryRoles?: string[]; secondaryRoles?: string[] };
  weights?: Partial<MatchWeights>;
  /** Work authorization, languages, clearance and exclusions, only as the candidate stated them. */
  facts?: CandidateFacts;
}

/** What Claude may contribute. Every value is bounded or verified before it is used. */
export interface AiAssessment {
  /** Points to add to the deterministic score. Held within AI_LIMIT. */
  adjustment: number;
  evidence?: string[];
  strengths?: { text: string; evidence: string }[];
  gaps?: string[];
  note?: string;
  review?: Omit<AiReview, "status">;
}

/** Claude can move the final score at most this many points from the deterministic score. */
export const AI_LIMIT = 15;

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (items: string[], n = 5) => items.slice(0, n).join(", ") + (items.length > n ? ` and ${items.length - n} more` : "");

/* ---------- weights ---------- */

export function normalizeWeights(w: Partial<MatchWeights> | undefined): MatchWeights {
  const out = { ...DEFAULT_MATCH_WEIGHTS };
  let total = 0;
  for (const k of MATCH_COMPONENTS) {
    const v = w?.[k];
    out[k] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_MATCH_WEIGHTS[k];
    total += out[k];
  }
  if (total <= 0) return { ...DEFAULT_MATCH_WEIGHTS };
  for (const k of MATCH_COMPONENTS) out[k] = (out[k] / total) * 100;
  return out;
}

/* ---------- seniority ---------- */

const LEVEL: Record<Seniority, number> = { Entry: 0, Junior: 1, "Mid-level": 2, Senior: 3, Lead: 4, Manager: 4, Principal: 5, Executive: 6 };
const LEVEL_NAME = ["entry-level", "junior", "mid-level", "senior", "lead", "principal", "executive"];

export function titleLevel(title: string): number | null {
  if (/\b(intern|co-?op|entry)\b/i.test(title)) return 0;
  if (/\b(junior|jr)\b/i.test(title)) return 1;
  if (/\b(intermediate|mid)\b/i.test(title)) return 2;
  if (/\b(senior|sr)\b/i.test(title)) return 3;
  if (/\b(lead|manager)\b/i.test(title)) return 4;
  if (/\b(principal|staff|architect|director)\b/i.test(title)) return 5;
  return null;
}
export const levelFromYears = (y: number) => (y >= 8 ? 4 : y >= 5 ? 3 : y >= 3 ? 2 : 1);

/* ---------- role similarity ---------- */

const STOP = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "intermediate", "the", "of", "and", "ii", "iii"]);
const SYN: Record<string, string> = { engineer: "developer", programmer: "developer", bi: "intelligence" };
/** Role nouns that say little about the kind of work: every software job is a "developer". */
const GENERIC = new Set(["developer", "analyst", "architect", "specialist", "consultant", "manager", "administrator"]);
const GENERIC_WEIGHT = 0.3;

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/full[\s-]stack/g, "fullstack")
      .split(/[^a-z0-9.+#]+/)
      .filter((t) => t && !STOP.has(t))
      .map((t) => SYN[t] ?? t),
  );

/** 0 to 1. The distinguishing words (data, ios, azure) carry the score; a shared "developer" adds only a little. */
export function titleSimilarity(title: string, roles: string[]): number {
  const a = tokens(title);
  let best = 0;
  for (const role of roles) {
    const b = tokens(role);
    const distinct = [...b].filter((t) => !GENERIC.has(t));
    const generic = [...b].filter((t) => GENERIC.has(t));
    const denom = distinct.length + (generic.length ? GENERIC_WEIGHT : 0);
    if (!denom) continue;
    const got = distinct.filter((t) => a.has(t)).length + (generic.some((t) => a.has(t)) ? GENERIC_WEIGHT : 0);
    best = Math.max(best, got / denom);
  }
  return best;
}

/* ---------- helpers ---------- */

function conceptCount(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Quotes are accepted only if they appear in the resume. This is what keeps experience from being invented. */
export function verifyQuotes(quotes: string[] | undefined, resumeText: string | null | undefined): string[] {
  if (!quotes?.length || !resumeText) return [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const hay = norm(resumeText);
  const out: string[] = [];
  for (const q of quotes) {
    const n = norm(q);
    if (n.length >= 12 && hay.includes(n)) out.push(q.replace(/\s+/g, " ").trim().slice(0, 240));
  }
  return dedupe(out).slice(0, 3);
}

function pickEvidence(resumeText: string, skills: string[]): string[] {
  // Evidence should describe work done, so skip bare skill lists. The leading bullet is dropped; the rest stays word for word.
  const lines = resumeText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-\u2022*\u2013]\s*/, ""))
    .filter((l) => l.length >= 25 && !/^(?:technical |core |key )?(?:skills|technologies|tools)\b/i.test(l) && (l.match(/,/g)?.length ?? 0) < 5);
  const patterns = skills.map((s) => skillPattern(s));
  return lines
    .map((line) => ({ line, hits: patterns.filter((p) => p.test(line)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((x) => x.line.slice(0, 220));
}

/* ---------- skills ---------- */

const PREFERRED_WEIGHT = 0.4;

function matchSkill(skill: string, importance: "required" | "preferred", has: (s: string) => boolean, lines: ResumeLine[]) {
  const implied = (IMPLIED_BY[skill] ?? []).filter(has);
  const onProfile = has(skill) || implied.length > 0;
  const direct = skillEvidence(skill, lines, onProfile, implied);
  const directCredit = EVIDENCE_CREDIT[direct.level];

  // A related skill earns its relation's share of what the resume shows for that skill, so at the same level of
  // evidence it is always worth less than the skill itself.
  let best: { credit: number; via: string; why: string; level: SkillMatchItem["level"]; refs: SkillMatchItem["evidence"] } | null = null;
  for (const t of transfersFor(skill, has)) {
    const e = skillEvidence(t.via, lines, true);
    const credit = t.credit * EVIDENCE_CREDIT[e.level];
    if (!best || credit > best.credit) best = { credit, via: t.via, why: t.why, level: e.level, refs: e.refs };
  }

  const useRelated = best !== null && best.credit > directCredit;
  const item: SkillMatchItem = {
    skill,
    importance,
    level: direct.level,
    credit: Math.round((useRelated ? best!.credit : directCredit) * 100) / 100,
    ...(useRelated ? { via: best!.via, relation: best!.why } : {}),
    evidence: useRelated && !onProfile ? best!.refs : direct.refs,
  };
  return { item, onProfile, related: onProfile ? null : best };
}

/* ---------- the engine ---------- */

export function scoreJob(job: MatchableJob, input: MatchInput, ai?: AiAssessment): MatchResult {
  const { profile, resumeText, preferences, facts } = input;
  const weights = normalizeWeights(input.weights);
  const extracted = extractRequirements(job);
  const description = guardPosting(job.description).clean;
  const text = `${job.title}\n${description}`;
  const req = parseRequirements(job.title, description);
  const lines = resumeText?.trim() ? resumeLines(resumeText) : [];
  const postingStatus =
    job.postingStatus ??
    assessPosting({ description: job.description, descriptionTruncated: job.descriptionTruncated, postedAt: job.postedAt ?? null, source: job.source ?? "adzuna", applyUrl: job.applyUrl ?? null }, new Date(0)).status;
  const eligibility = checkEligibility(job.title, description, facts);

  const mine = profileSkills(profile.skills);
  const mineSet = new Set(mine.map((s) => s.toLowerCase()));
  const has = (skill: string) => mineSet.has(canonicalSkill(skill).toLowerCase());

  /* technical skills */
  const required = req.required.map((s) => matchSkill(s, "required", has, lines));
  const preferred = req.preferred.map((s) => matchSkill(s, "preferred", has, lines));
  const everySkill = [...required, ...preferred];
  const requiredMatched = required.filter((x) => x.onProfile).map((x) => x.item.skill);
  const preferredMatched = preferred.filter((x) => x.onProfile).map((x) => x.item.skill);
  const requiredMissing = required.filter((x) => !x.onProfile && !x.related).map((x) => x.item.skill);
  const preferredMissing = preferred.filter((x) => !x.onProfile && !x.related).map((x) => x.item.skill);
  const transferable = everySkill.filter((x) => x.related).map((x) => ({ skill: x.item.skill, via: x.related!.via, why: x.related!.why, credit: x.item.credit }));
  // Coverage counts what the candidate has at all; how well it is shown is reflected in the score itself.
  const reqCoverage = required.length ? required.reduce((n, x) => n + (x.onProfile ? 1 : x.item.credit), 0) / required.length : null;
  const sum = (xs: typeof required) => xs.reduce((n, x) => n + x.item.credit, 0);
  const listedOnly = required.filter((x) => x.onProfile && x.item.level === "listed" && !x.item.via).map((x) => x.item.skill);

  const skillWeight = required.length + PREFERRED_WEIGHT * preferred.length;
  const skillsScore = skillWeight ? (100 * (sum(required) + PREFERRED_WEIGHT * sum(preferred))) / skillWeight : null;
  const skillsNote = !skillWeight
    ? "The posting does not name technical skills that could be read."
    : `${requiredMatched.length} of ${required.length} required${preferred.length ? ` and ${preferredMatched.length} of ${preferred.length} preferred` : ""} skills matched${transferable.length ? `, ${transferable.length} related` : ""}.${listedOnly.length ? ` ${list(listedOnly, 3)} only listed, with no work shown.` : ""}`;

  /* relevant experience */
  const years = profile.yearsOfExperience;
  const yearsFit = req.requiredYears && years !== null ? Math.min(1, years / req.requiredYears) : null;
  const roleFit = Math.max(titleSimilarity(job.title, profile.detectedRoles), 0.85 * titleSimilarity(job.title, profile.recommendedRoles));
  const experienceRule = 100 * (yearsFit !== null ? 0.45 * yearsFit + 0.55 * roleFit : roleFit);
  const experienceGaps: string[] = [];
  if (req.requiredYears && years !== null && years < req.requiredYears) {
    experienceGaps.push(`Asks for ${req.requiredYears}+ years of experience; your resume shows about ${years}.`);
  }
  if (roleFit < 0.4) experienceGaps.push("The job title is outside the roles on your resume.");
  const experienceNote =
    yearsFit !== null
      ? `${years} years against ${req.requiredYears}+ asked; title ${roleFit >= 0.8 ? "matches" : roleFit >= 0.4 ? "is close to" : "differs from"} your roles.`
      : `Title ${roleFit >= 0.8 ? "matches" : roleFit >= 0.4 ? "is close to" : "differs from"} your roles. The posting states no years.`;

  /* responsibilities */
  const shown = lines.filter((l) => l.level === "professional" || l.level === "project").map((l) => l.text);
  const resumeBasis = shown.length ? shown.join("\n") : resumeText?.trim() || `${profile.summary}\n${mine.join(" ")}\n${profile.detectedRoles.join(" ")}`;
  const dutyText = `${job.title}\n${req.duties}`;
  const jobConcepts = CONCEPTS.map((c) => ({ c, n: conceptCount(dutyText, c.pattern) })).filter((x) => x.n > 0);
  let responsibilitiesRule: number | null = null;
  let responsibilitiesNote = "The posting does not describe the work in terms that could be compared.";
  if (jobConcepts.length) {
    let got = 0;
    let all = 0;
    const strong: string[] = [];
    const absent: string[] = [];
    for (const { c, n } of jobConcepts) {
      const w = Math.min(3, n);
      const seen = conceptCount(resumeBasis, c.pattern);
      const strength = seen >= 2 ? 1 : seen === 1 ? 0.55 : 0;
      got += w * strength;
      all += w;
      (strength === 1 ? strong : strength === 0 ? absent : []).push(c.label);
    }
    responsibilitiesRule = (100 * got) / all;
    responsibilitiesNote = `The work centres on ${list(jobConcepts.map((x) => x.c.label), 3)}.${strong.length ? ` Your resume shows ${list(strong, 3)} repeatedly.` : ""}${absent.length ? ` No sign of ${list(absent, 3)}.` : ""}`;
  }

  /* seniority */
  const jobLevel = titleLevel(job.title) ?? (req.requiredYears ? levelFromYears(req.requiredYears) : null);
  const myLevel = LEVEL[profile.seniority];
  let seniorityScore: number | null = null;
  let seniority: MatchDetail["seniority"] = { status: "unknown", note: "The posting does not make the level clear." };
  let seniorityGap = 0;
  if (jobLevel !== null) {
    const diff = jobLevel - myLevel;
    seniorityGap = diff;
    seniorityScore = diff === 0 ? 100 : diff === 1 ? 70 : diff === 2 ? 35 : diff >= 3 ? 10 : diff === -1 ? 88 : 60;
    seniority = {
      status: diff >= 1 ? "stretch" : diff <= -2 ? "overqualified" : "aligned",
      note: `The role reads as ${LEVEL_NAME[Math.min(jobLevel, 6)]}; your resume reads as ${LEVEL_NAME[Math.min(myLevel, 6)]}.`,
    };
  }

  /* industry */
  const jobIndustries = INDUSTRIES.filter((i) => i.pattern.test(text));
  const myIndustryText = resumeText?.trim() || profile.summary;
  const sharedIndustries = jobIndustries.filter((i) => i.pattern.test(myIndustryText));
  const industryScore = jobIndustries.length ? (sharedIndustries.length ? 100 : 40) : null;
  const industryNote = !jobIndustries.length
    ? "The posting names no specific industry."
    : sharedIndustries.length
      ? `You have ${list(sharedIndustries.map((i) => i.label), 2)} experience.`
      : `The posting is in ${list(jobIndustries.map((i) => i.label), 2)}; your resume does not show that industry.`;

  /* location and work arrangement */
  let location: MatchDetail["location"] = { status: "unknown", note: "No location preferences are set." };
  if (preferences?.locations.length) {
    const wantsRemote = preferences.locations.some((l) => /^remote\b/i.test(l.trim()));
    const places = preferences.locations
      .filter((l) => !/^remote\b/i.test(l.trim()))
      .flatMap((l) => REGIONS.find((r) => r.triggers.test(l))?.places ?? [l.split(",")[0].trim().toLowerCase()])
      .filter(Boolean);
    const inPlace = places.some((p) => new RegExp(`(?<![A-Za-z])${escapeRe(p)}(?![A-Za-z])`, "i").test(job.location));
    const vague = !job.location.trim() || /location not listed|^canada$/i.test(job.location.trim());
    if (job.workMode === "Remote") {
      if (FOREIGN_HINTS.test(job.location) && !CANADA_HINTS.test(job.location)) {
        location = { status: "partial", note: "Remote, but the listing points outside Canada. Check that you can work from Canada." };
      } else if (wantsRemote || inPlace) {
        location = { status: "yes", note: "Remote and open to Canada." };
      } else {
        location = { status: "partial", note: "Remote, but remote work is not one of your listed preferences." };
      }
    } else if (inPlace) {
      location = { status: "yes", note: `${job.workMode === "Hybrid" ? "Hybrid" : "On-site"} in a city you want (${job.location}).` };
    } else if (vague) {
      location = { status: "unknown", note: "The posting does not give a specific city." };
    } else {
      location = { status: "no", note: `${job.location} is outside your preferred cities.` };
    }
  }
  const locationScore = location.status === "yes" ? 100 : location.status === "partial" ? 55 : location.status === "no" ? 10 : null;

  /* salary: reported, not scored, because the filters already enforce it */
  let salary: MatchDetail["salary"] = { status: "unknown", note: "No salary is stated." };
  if (job.salary?.estimated) salary = { status: "unknown", note: "The salary shown was estimated by the job board, not stated by the employer." };
  else if (job.salary) {
    const y = yearlySalary(job as Job);
    const min = preferences?.minSalary ?? null;
    if (y !== null && min) {
      salary = y >= min
        ? { status: "meets", note: `Top of the stated range reaches your ${min.toLocaleString("en-CA")} minimum.` }
        : { status: "below", note: `Stated pay tops out below your ${min.toLocaleString("en-CA")} minimum.` };
    }
  }

  /* career alignment: only from what the candidate said they want */
  const career = careerAlignment({ title: job.title, description }, preferences, facts?.exclusions ?? [], titleSimilarity);

  /* combine */
  const rawScores: Record<MatchComponentKey, number | null> = {
    skills: skillsScore,
    experience: experienceRule,
    responsibilities: responsibilitiesRule,
    career: career.score,
    seniority: seniorityScore,
    industry: industryScore,
    location: locationScore,
  };
  const notes: Record<MatchComponentKey, string> = {
    skills: skillsNote,
    experience: experienceNote,
    responsibilities: responsibilitiesNote,
    career: career.note,
    seniority: seniority.note,
    industry: industryNote,
    location: location.note,
  };
  const applicable = MATCH_COMPONENTS.filter((k) => rawScores[k] !== null);
  const totalWeight = applicable.reduce((n, k) => n + weights[k], 0) || 1;
  const components: MatchComponent[] = MATCH_COMPONENTS.map((k) => ({
    key: k,
    label: MATCH_COMPONENT_LABELS[k],
    weight: rawScores[k] === null ? 0 : Math.round(((weights[k] / totalWeight) * 100) * 10) / 10,
    score: rawScores[k] === null ? null : Math.round(rawScores[k]!),
    note: notes[k],
  }));
  const weighted = applicable.reduce((n, k) => n + (rawScores[k]! * weights[k]) / totalWeight, 0);

  /* confidence: how much there was to judge by. Never part of the score. */
  const evidenceLines = resumeText ? pickEvidence(resumeText, [...requiredMatched, ...preferredMatched]) : [];
  const confidence = assessConfidence({
    descriptionLength: description.length,
    truncated: job.descriptionTruncated,
    structured: req.structured,
    requiredCount: required.length,
    extractionConfidence: extracted.confidence,
    hasResumeText: Boolean(resumeText?.trim()),
    hasWorkEvidence: lines.some((l) => l.level === "professional"),
    yearsKnown: years !== null,
    profileSkillCount: mine.length,
    evidenceCount: evidenceLines.length,
    judgedComponents: applicable.length,
    postingStatus,
    aiApplied: Boolean(ai),
  });

  /* flags: doubts about the analysis itself */
  const flags: string[] = [];
  const unsure = extracted.items.filter((i) => i.kind === "skill" && i.confidence < LOW_CONFIDENCE).length;
  if (extracted.items.some((i) => i.kind === "skill") && extracted.confidence < LOW_CONFIDENCE) flags.push("The requirements were read with low confidence.");
  else if (unsure) flags.push(`${unsure} requirement${unsure === 1 ? " was" : "s were"} read with low confidence.`);
  if (description.length < 400) flags.push("The posting is very thin, so little can be concluded from it.");
  if (extracted.suspicious.length) flags.push("The posting contains text that reads like instructions to an AI. It was ignored.");
  if (!resumeText?.trim()) flags.push("No resume text was available, so no skill could be shown by your work.");

  /* caps: keyword overlap alone must not produce a high score */
  const caps: { limit: number; reason: string }[] = [];
  // Weighted by evidence: skills that are merely listed or related do not make up half of what a posting requires.
  const shownCoverage = required.length ? sum(required) / required.length : null;
  if (required.length >= 3 && shownCoverage !== null && shownCoverage < 0.5) caps.push({ limit: 65, reason: "fewer than half of the required skills are matched by what your resume shows" });
  if (required.length >= 2 && requiredMatched.length === 0) caps.push({ limit: 55, reason: "none of the required skills is on your resume" });
  const targetFit = titleSimilarity(job.title, preferences?.roles ?? []);
  if (roleFit < 0.25 && targetFit < 0.5 && (reqCoverage ?? 0) < 0.8) caps.push({ limit: 60, reason: "the role is outside the work on your resume" });
  if (required.length >= 3 && (reqCoverage ?? 0) >= 0.6 && responsibilitiesRule !== null && responsibilitiesRule < 40) caps.push({ limit: 60, reason: "the skill words match but the day-to-day work does not" });
  if (seniorityGap >= 3) caps.push({ limit: 55, reason: "the role is far more senior than your resume" });
  else if (seniorityGap === 2) caps.push({ limit: 70, reason: "the role is well above your level" });
  else if (seniorityGap <= -2) caps.push({ limit: 65, reason: "the role is well below your level" });
  if (location.status === "no") caps.push({ limit: 69, reason: "the job is outside your preferred cities" });
  if (career.excludedTerm) caps.push({ limit: 50, reason: `it mentions "${career.excludedTerm}", which you excluded` });
  // Decided from the posting alone. Confidence also counts the AI review and posting status, which must never move a score.
  const thinPosting = description.length < 200 || (description.length < 500 && (job.descriptionTruncated || !req.structured));
  if (thinPosting || required.length < 3) caps.push({ limit: 89, reason: "the posting gives too little detail to call this excellent" });
  const limit = caps.length ? Math.min(...caps.map((c) => c.limit)) : 100;

  /* deterministic score, then Claude's bounded adjustment, then the caps again */
  const deterministicScore = Math.round(clamp(Math.min(weighted, limit)));
  const aiAdjustment = ai && Number.isFinite(ai.adjustment) ? Math.round(clamp(ai.adjustment, -AI_LIMIT, AI_LIMIT)) : 0;
  const score = Math.round(clamp(Math.min(deterministicScore + aiAdjustment, limit)));
  const held = weighted > limit || deterministicScore + aiAdjustment > limit;
  const appliedCaps = held ? caps.filter((c) => c.limit === limit).map((c) => `Held to ${limit}: ${c.reason}.`) : [];

  /* evidence, strengths and gaps */
  const evidence = dedupe([...verifyQuotes(ai?.evidence, resumeText), ...evidenceLines]).slice(0, 4);
  const clean = (g: string) => g.replace(/\s+/g, " ").trim().slice(0, 200);
  const aiGaps = (ai?.gaps ?? []).map(clean).filter(Boolean).slice(0, 3);
  const allGaps = dedupe([...experienceGaps, ...aiGaps]).slice(0, 5);
  const postingLine = (skill: string) => extracted.items.find((i) => i.kind === "skill" && i.value.toLowerCase() === skill.toLowerCase())?.evidence;
  const asEvidence = (line: string | undefined) => (line ? [`Posting: ${line.slice(0, 280)}`] : []);

  const strengths: EvidencedPoint[] = everySkill
    .filter((x) => x.onProfile && (x.item.level === "professional" || x.item.level === "project") && x.item.evidence.length)
    .slice(0, 8)
    .map((x) => ({ text: `${x.item.skill}: shown in your ${x.item.level === "professional" ? "work experience" : "projects"}.`, evidence: [x.item.evidence[0].quote], source: "rules" as const }));
  // Claude's strengths count only when the line it points to is really on the resume.
  for (const s of (ai?.strengths ?? []).slice(0, 3)) {
    const quote = verifyQuotes([s.evidence], resumeText);
    if (quote.length && clean(s.text)) strengths.push({ text: clean(s.text), evidence: quote, source: "ai" });
  }

  const gaps: EvidencedPoint[] = [
    ...experienceGaps.map((g) => ({ text: g, evidence: [], source: "rules" as const })),
    ...requiredMissing.map((s) => ({ text: `${s} is required and not on your resume.`, evidence: asEvidence(postingLine(s)), source: "rules" as const })),
    ...transferable.filter((t) => req.required.includes(t.skill)).map((t) => ({ text: `${t.skill} is required. You have ${t.via}, which is related but not the same. ${t.why}`, evidence: asEvidence(postingLine(t.skill)), source: "rules" as const })),
    ...required
      .filter((x) => x.onProfile && !x.item.via && (x.item.level === "listed" || x.item.level === "learning"))
      .map((x) => ({
        text: x.item.level === "listed" ? `${x.item.skill} is only listed on your resume; no work or project shows it.` : `${x.item.skill} appears only as study or training on your resume.`,
        evidence: asEvidence(postingLine(x.item.skill)),
        source: "rules" as const,
      })),
    ...aiGaps.map((g) => ({ text: g, evidence: [], source: "ai" as const })),
  ].slice(0, 15);

  /* explanation */
  const verdict = score >= 90 ? "Excellent match" : score >= 70 ? "Strong match" : score >= 50 ? "Partial match" : "Weak match";
  const parts: string[] = [`${verdict}.`];
  if (eligibility.status === "not_eligible") parts.unshift(`Not eligible: ${eligibility.reason}`);
  else if (eligibility.status === "needs_verification") parts.push(`Check first: ${eligibility.reason}`);
  if (postingStatus === "expired") parts.push("The posting appears to be closed.");
  if (required.length) parts.push(`You have ${requiredMatched.length} of ${required.length} required skills${requiredMatched.length ? ` (${list(requiredMatched, 4)})` : ""}.`);
  else parts.push("The posting names no required skills that could be read.");
  if (listedOnly.length) parts.push(`${list(listedOnly, 3)} ${listedOnly.length === 1 ? "is" : "are"} only listed, not shown in your work.`);
  for (const t of transferable.filter((x) => req.required.includes(x.skill)).slice(0, 2)) parts.push(`${t.skill} is not on your resume, but your ${t.via} experience is related.`);
  if (requiredMissing.length) parts.push(`Missing: ${list(requiredMissing, 4)}.`);
  if (seniority.status !== "unknown") parts.push(seniority.note);
  if (location.status === "no" || location.status === "partial") parts.push(location.note);
  if (salary.status === "below") parts.push(salary.note);
  parts.push(...appliedCaps);
  const explanation = parts.join(" ");

  const detail: MatchDetail = {
    confidence: confidence.label,
    confidenceReasons: confidence.reasons,
    confidenceScore: confidence.score,
    requiredMatched,
    requiredMissing,
    preferredMatched,
    preferredMissing,
    transferable,
    skillEvidence: everySkill.map((x) => x.item),
    evidence,
    experienceGaps: allGaps,
    strengths,
    gaps,
    careerAlignment: { score: career.score, note: career.note, role: career.role },
    seniority,
    location,
    salary,
    components,
    caps: appliedCaps,
    capLimit: caps.length ? limit : null,
    flags,
    explanation,
    ...(ai?.note ? { aiNote: ai.note.replace(/\s+/g, " ").trim().slice(0, 500) } : {}),
  };

  return {
    score,
    matchingSkills: dedupe([...requiredMatched, ...preferredMatched]),
    missingSkills: requiredMissing,
    matchReason: explanation,
    source: ai ? "ai" : "heuristic",
    detail,
    deterministicScore,
    aiAdjustment: score - deterministicScore,
    finalScore: score,
    eligibility,
    postingStatus,
    recommendedAction: recommendedAction({ score, confidence: confidence.label, eligibility: eligibility.status, postingStatus, missingRequired: requiredMissing.length }),
    ai: ai ? { ...ai.review, status: "applied" } : { status: "unavailable" },
  };
}

/** Skills named in a posting, split by how strongly the posting asks for them. */
export function describeRequirements(title: string, description: string) {
  const r = parseRequirements(title, description);
  return { required: r.required, preferred: r.preferred, requiredYears: r.requiredYears, structured: r.structured, all: flattenSkills(extractSkills(`${title}\n${description}`)) };
}
