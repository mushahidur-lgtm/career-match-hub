import { yearlySalary } from "@/lib/format";
import { profileSkills } from "@/lib/heuristics";
import { canonicalSkill, dedupe, extractSkills, flattenSkills, skillPattern } from "@/lib/skills";
import {
  DEFAULT_MATCH_WEIGHTS,
  MATCH_COMPONENTS,
  MATCH_COMPONENT_LABELS,
  type CandidateProfile,
  type Confidence,
  type Job,
  type MatchComponent,
  type MatchComponentKey,
  type MatchDetail,
  type MatchResult,
  type MatchWeights,
  type Seniority,
} from "@/types/job";
import { CANADA_HINTS, CONCEPTS, FOREIGN_HINTS, INDUSTRIES, REGIONS, SKILL_FAMILIES } from "./knowledge";
import { parseRequirements } from "./requirements";

export type MatchableJob = Pick<Job, "title" | "description" | "location" | "workMode" | "salary" | "descriptionTruncated">;

export interface MatchInput {
  profile: CandidateProfile;
  /** The resume text. Evidence quotes are copied from it, and it is the source for responsibilities. */
  resumeText?: string | null;
  /** `roles` are the jobs the candidate is aiming for. A target role is not held back for differing from past titles. */
  preferences?: { locations: string[]; minSalary: number | null; roles?: string[] };
  weights?: MatchWeights;
}

/** What Claude may contribute. Every value is bounded or verified before it is used. */
export interface AiOverrides {
  experience?: number;
  responsibilities?: number;
  evidence?: string[];
  gaps?: string[];
  note?: string;
}

/** Claude can move a contextual score at most this far from the rule-based value. */
export const AI_LIMIT = 25;

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

/* ---------- the engine ---------- */

export function scoreJob(job: MatchableJob, input: MatchInput, overrides?: AiOverrides): MatchResult {
  const { profile, resumeText, preferences } = input;
  const weights = normalizeWeights(input.weights);
  const text = `${job.title}\n${job.description}`;
  const req = parseRequirements(job.title, job.description);

  const mine = profileSkills(profile.skills);
  const mineSet = new Set(mine.map((s) => s.toLowerCase()));
  const has = (skill: string) => mineSet.has(canonicalSkill(skill).toLowerCase());

  /* technical skills */
  const transferable: { skill: string; via: string }[] = [];
  const credit = (skill: string): number => {
    if (has(skill)) return 1;
    let best = 0;
    for (const fam of SKILL_FAMILIES) {
      if (!fam.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) continue;
      const via = fam.skills.find((s) => s.toLowerCase() !== skill.toLowerCase() && has(s));
      if (via && fam.credit > best) {
        best = fam.credit;
        const existing = transferable.findIndex((t) => t.skill === skill);
        if (existing >= 0) transferable.splice(existing, 1);
        transferable.push({ skill, via });
      }
    }
    return best;
  };

  const reqCredits = req.required.map((s) => ({ s, c: credit(s) }));
  const prefCredits = req.preferred.map((s) => ({ s, c: credit(s) }));
  const requiredMatched = reqCredits.filter((x) => x.c === 1).map((x) => x.s);
  const preferredMatched = prefCredits.filter((x) => x.c === 1).map((x) => x.s);
  const requiredMissing = reqCredits.filter((x) => x.c === 0).map((x) => x.s);
  const preferredMissing = prefCredits.filter((x) => x.c === 0).map((x) => x.s);
  const reqCoverage = reqCredits.length ? reqCredits.reduce((n, x) => n + x.c, 0) / reqCredits.length : null;

  const skillWeight = reqCredits.length + 0.4 * prefCredits.length;
  const skillsScore = skillWeight
    ? (100 * (reqCredits.reduce((n, x) => n + x.c, 0) + 0.4 * prefCredits.reduce((n, x) => n + x.c, 0))) / skillWeight
    : null;
  const skillsNote = !skillWeight
    ? "The posting does not name technical skills that could be read."
    : `${requiredMatched.length} of ${reqCredits.length} required${prefCredits.length ? ` and ${preferredMatched.length} of ${prefCredits.length} preferred` : ""} skills matched${transferable.length ? `, ${transferable.length} related` : ""}.`;

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
  const resumeBasis = resumeText?.trim() || `${profile.summary}\n${mine.join(" ")}\n${profile.detectedRoles.join(" ")}`;
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

  /* optional, bounded contributions from Claude */
  const bound = (rule: number | null, ai: number | undefined) =>
    rule !== null && typeof ai === "number" && Number.isFinite(ai) ? clamp(ai, Math.max(0, rule - AI_LIMIT), Math.min(100, rule + AI_LIMIT)) : null;
  const aiExperience = bound(experienceRule, overrides?.experience);
  const aiResponsibilities = bound(responsibilitiesRule, overrides?.responsibilities);

  /* combine */
  const rawScores: Record<MatchComponentKey, number | null> = {
    skills: skillsScore,
    experience: aiExperience ?? experienceRule,
    responsibilities: aiResponsibilities ?? responsibilitiesRule,
    seniority: seniorityScore,
    industry: industryScore,
    location: locationScore,
  };
  const notes: Record<MatchComponentKey, string> = {
    skills: skillsNote,
    experience: experienceNote,
    responsibilities: responsibilitiesNote,
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
    ...((k === "experience" && aiExperience !== null) || (k === "responsibilities" && aiResponsibilities !== null) ? { aiAdjusted: true } : {}),
  }));
  const weighted = applicable.reduce((n, k) => n + (rawScores[k]! * weights[k]) / totalWeight, 0);

  /* confidence: how much the posting and the resume give us to judge by */
  const reasons: string[] = [];
  let pts = 0;
  const note = (points: number, reason: string) => {
    pts += points;
    reasons.push(reason);
  };
  const len = job.description.length;
  if (len >= 1200) note(2, "Full job description available.");
  else if (len >= 500) note(1, "Moderate-length job description.");
  else note(0, "Short job description.");
  if (job.descriptionTruncated) note(-1, "The job board only provides the first part of the posting.");
  if (req.structured) note(1, "Required and preferred skills could be told apart.");
  else note(0, "No requirements section found, so every skill is treated as required.");
  if (reqCredits.length >= 3) note(1, `${reqCredits.length} required skills found to compare.`);
  else note(0, "Few skills named in the posting.");
  if (years !== null) note(1, "Your years of experience are known.");
  else note(0, "Your years of experience are unknown.");
  if (resumeText?.trim()) note(1, "Compared against your full resume text.");
  else note(0, "Compared against your profile only, not the resume text.");
  if (applicable.length >= 5) note(1, "Five or more parts of the match could be judged.");
  const confidence: Confidence = pts >= 6 ? "high" : pts >= 3 ? "medium" : "low";

  /* caps: keyword overlap alone must not produce a high score */
  const caps: { limit: number; reason: string }[] = [];
  if (reqCredits.length >= 3 && reqCoverage !== null && reqCoverage < 0.5) caps.push({ limit: 65, reason: "fewer than half of the required skills are matched" });
  if (reqCredits.length >= 2 && requiredMatched.length === 0) caps.push({ limit: 55, reason: "none of the required skills is on your resume" });
  const targetFit = titleSimilarity(job.title, preferences?.roles ?? []);
  if (roleFit < 0.25 && targetFit < 0.5 && (reqCoverage ?? 0) < 0.8) caps.push({ limit: 60, reason: "the role is outside the work on your resume" });
  if (seniorityGap >= 3) caps.push({ limit: 55, reason: "the role is far more senior than your resume" });
  if (location.status === "no") caps.push({ limit: 69, reason: "the job is outside your preferred cities" });
  if (confidence === "low" || reqCredits.length < 3) caps.push({ limit: 89, reason: "the posting gives too little detail to call this excellent" });
  const limit = caps.length ? Math.min(...caps.map((c) => c.limit)) : 100;
  const score = Math.round(clamp(Math.min(weighted, limit)));
  const appliedCaps = weighted > limit ? caps.filter((c) => c.limit === limit).map((c) => `Held to ${limit}: ${c.reason}.`) : [];

  /* evidence */
  const detEvidence = resumeText ? pickEvidence(resumeText, [...requiredMatched, ...preferredMatched]) : [];
  const evidence = dedupe([...verifyQuotes(overrides?.evidence, resumeText), ...detEvidence]).slice(0, 4);
  const aiGaps = (overrides?.gaps ?? []).map((g) => g.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 3);
  const allGaps = dedupe([...experienceGaps, ...aiGaps]).slice(0, 5);

  /* explanation */
  const verdict = score >= 90 ? "Excellent match" : score >= 70 ? "Strong match" : score >= 50 ? "Partial match" : "Weak match";
  const parts: string[] = [`${verdict}.`];
  if (reqCredits.length) parts.push(`You have ${requiredMatched.length} of ${reqCredits.length} required skills${requiredMatched.length ? ` (${list(requiredMatched, 4)})` : ""}.`);
  else parts.push("The posting names no required skills that could be read.");
  for (const t of transferable.filter((x) => req.required.includes(x.skill)).slice(0, 2)) parts.push(`${t.skill} is not on your resume, but your ${t.via} experience is related.`);
  if (requiredMissing.length) parts.push(`Missing: ${list(requiredMissing, 4)}.`);
  if (seniority.status !== "unknown") parts.push(seniority.note);
  if (location.status === "no" || location.status === "partial") parts.push(location.note);
  if (salary.status === "below") parts.push(salary.note);
  parts.push(...appliedCaps);
  const explanation = parts.join(" ");

  const detail: MatchDetail = {
    confidence,
    confidenceReasons: reasons,
    requiredMatched,
    requiredMissing,
    preferredMatched,
    preferredMissing,
    transferable,
    evidence,
    experienceGaps: allGaps,
    seniority,
    location,
    salary,
    components,
    caps: appliedCaps,
    explanation,
    ...(overrides?.note ? { aiNote: overrides.note.replace(/\s+/g, " ").trim().slice(0, 500) } : {}),
  };

  return {
    score,
    matchingSkills: dedupe([...requiredMatched, ...preferredMatched]),
    missingSkills: requiredMissing,
    matchReason: explanation,
    source: overrides ? "ai" : "heuristic",
    detail,
  };
}

/** Skills named in a posting, split by how strongly the posting asks for them. */
export function describeRequirements(title: string, description: string) {
  const r = parseRequirements(title, description);
  return { required: r.required, preferred: r.preferred, requiredYears: r.requiredYears, structured: r.structured, all: flattenSkills(extractSkills(`${title}\n${description}`)) };
}
