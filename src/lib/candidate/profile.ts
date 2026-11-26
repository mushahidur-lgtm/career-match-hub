import { profileSkills } from "@/lib/heuristics";
import { INDUSTRIES } from "@/lib/matching/knowledge";
import type { CandidateFacts, CandidateProfile, EducationEntry, EvidenceLevel, EvidenceRef, Seniority, WorkEntry } from "@/types/job";
import { resumeLines, skillEvidence } from "./evidence";

/** The Candidate Intelligence Profile: the stored profile, plus what the resume actually shows for each skill. */

export interface CandidateSkill {
  skill: string;
  level: EvidenceLevel;
  /** How sure we are of the level, 0 to 1. */
  confidence: number;
  evidence: EvidenceRef[];
}

export interface CandidatePreferences {
  locations: string[];
  minSalary: number | null;
  roles?: string[];
  primaryRoles?: string[];
  secondaryRoles?: string[];
}

export interface CandidateIntelligence {
  targetTitles: string[];
  careerPaths: string[];
  experience: WorkEntry[];
  yearsOfExperience: number | null;
  seniority: Seniority;
  skills: CandidateSkill[];
  education: EducationEntry[];
  certifications: string[];
  domains: string[];
  leadership: EvidenceRef[];
  locations: string[];
  workModes: string[];
  minSalary: number | null;
  /** Only what the candidate stated. Null or empty means unknown. */
  facts: Required<CandidateFacts>;
  /** 0 to 1: how much there is to judge by. */
  completeness: number;
}

const LEADERSHIP = /\b(?:led|managed|mentored|supervised|coached|headed|directed)\b|\bteam (?:lead|of \d+)/i;

const CONFIDENCE: Record<EvidenceLevel, number> = { professional: 0.9, project: 0.75, learning: 0.7, listed: 0.5, missing: 0.5 };

export function buildCandidateIntelligence(
  profile: CandidateProfile,
  resumeText: string | null | undefined,
  preferences?: CandidatePreferences,
  facts?: CandidateFacts,
): CandidateIntelligence {
  const lines = resumeText?.trim() ? resumeLines(resumeText) : [];
  const skills = profileSkills(profile.skills).map((skill) => {
    const e = skillEvidence(skill, lines, true);
    // With no resume text, "listed" is only a reflection of what we could check.
    const confidence = !lines.length ? 0.3 : e.refs.length > 1 ? Math.min(0.95, CONFIDENCE[e.level] + 0.05) : CONFIDENCE[e.level];
    return { skill, level: e.level, confidence, evidence: e.refs };
  });
  const work = lines.filter((l) => l.level === "professional");
  const text = resumeText?.trim() || profile.summary;

  const parts = [Boolean(lines.length), work.length > 0, profile.yearsOfExperience !== null, skills.length >= 5, Boolean(profile.workHistory?.length)];

  return {
    targetTitles: preferences?.primaryRoles ?? preferences?.roles ?? [],
    careerPaths: preferences?.secondaryRoles ?? [],
    experience: profile.workHistory ?? [],
    yearsOfExperience: profile.yearsOfExperience,
    seniority: profile.seniority,
    skills,
    education: profile.education ?? [],
    certifications: profile.certifications ?? [],
    domains: INDUSTRIES.filter((i) => i.pattern.test(text)).map((i) => i.label),
    leadership: work.filter((l) => LEADERSHIP.test(l.text)).slice(0, 5).map((l) => ({ section: l.section, quote: l.text.slice(0, 220) })),
    locations: preferences?.locations ?? [],
    workModes: (preferences?.locations ?? []).some((l) => /^remote\b/i.test(l.trim())) ? ["Remote"] : [],
    minSalary: preferences?.minSalary ?? null,
    facts: {
      workAuthorization: facts?.workAuthorization ?? null,
      languages: facts?.languages ?? [],
      clearance: facts?.clearance ?? null,
      exclusions: facts?.exclusions ?? [],
    },
    completeness: parts.filter(Boolean).length / parts.length,
  };
}
