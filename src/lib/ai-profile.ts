import { verifyAgainstResume, yearsFromHistory } from "@/lib/resume-sections";
import { dedupe } from "@/lib/skills";
import type { CandidateProfile, EducationEntry, Seniority, SkillSet, WorkEntry } from "@/types/job";

/** What Claude returns for a resume. Unchecked: it is turned into a profile by `buildProfileFromAi`. */
export interface AiProfileData {
  summary: string;
  yearsOfExperience: number | null;
  seniority: Seniority;
  skills: SkillSet;
  detectedRoles: string[];
  recommendedRoles: string[];
  workHistory: WorkEntry[];
  education: EducationEntry[];
  certifications: string[];
}

/**
 * Claude's number of years is used only if the resume backs it up: the dated history agrees with it
 * (within a few years), or the resume itself states that number. Otherwise the dated history wins.
 */
export function trustedYears(claimed: number | null, fromHistory: number | null, resumeText: string): number | null {
  if (claimed === null || !Number.isFinite(claimed) || claimed < 0 || claimed > 60) return null;
  const years = Math.round(claimed);
  if (fromHistory !== null && years >= fromHistory - 2 && years <= fromHistory + 3) return years;
  if (new RegExp(`(?<!\\d)${years}\\s*\\+?\\s*(?:years?|yrs?)\\b`, "i").test(resumeText)) return years;
  return fromHistory === null && years <= 3 ? years : null;
}

const DATE_OK = /^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/;
const date = (d: string | null) => (d && DATE_OK.test(d.trim()) ? d.trim() : null);
const trim = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Turns Claude's answer into a profile. Jobs, schools and certificates are kept only if the
 * resume text contains them, so the profile can never list experience the resume does not show.
 * Where nothing survives, the keyword parser's reading of the resume is used instead.
 */
export function buildProfileFromAi(data: AiProfileData, resumeText: string, fallback: CandidateProfile, model: string): CandidateProfile {
  const verified = verifyAgainstResume(
    {
      work: data.workHistory.map((w) => ({
        title: trim(w.title, 200),
        company: trim(w.company, 200),
        start: date(w.start),
        end: w.current ? null : date(w.end),
        current: Boolean(w.current),
      })),
      education: data.education.map((e) => ({ credential: trim(e.credential, 200), institution: trim(e.institution, 200), year: date(e.year) })),
      certifications: data.certifications.map((c) => trim(c, 200)),
      roles: data.detectedRoles.map((r) => trim(r, 120)),
    },
    resumeText,
  );

  const workHistory = verified.work.length ? verified.work.slice(0, 40) : (fallback.workHistory ?? []);
  const education = verified.education.length ? verified.education.slice(0, 15) : (fallback.education ?? []);
  const certifications = dedupe(verified.certifications.length ? verified.certifications : (fallback.certifications ?? [])).slice(0, 30);

  const years = trustedYears(data.yearsOfExperience, yearsFromHistory(workHistory), resumeText) ?? yearsFromHistory(workHistory) ?? fallback.yearsOfExperience;

  const profile: CandidateProfile = {
    summary: trim(data.summary, 2000),
    yearsOfExperience: years,
    seniority: data.seniority,
    skills: {
      languages: dedupe(data.skills.languages).slice(0, 40),
      frameworks: dedupe(data.skills.frameworks).slice(0, 40),
      cloudData: dedupe(data.skills.cloudData).slice(0, 40),
      tools: dedupe(data.skills.tools).slice(0, 40),
    },
    // Only roles the resume supports. These feed the match, so an invented title would inflate scores.
    detectedRoles: dedupe([...workHistory.map((w) => w.title).filter(Boolean), ...verified.roles]).slice(0, 8),
    recommendedRoles: dedupe(data.recommendedRoles).slice(0, 8),
    source: "ai",
    model,
    workHistory,
    education,
    certifications,
  };
  if (!profile.recommendedRoles.length) profile.recommendedRoles = fallback.recommendedRoles;
  return profile;
}
