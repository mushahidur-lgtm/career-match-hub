import { detectEligibility } from "@/lib/eligibility/detect";
import { guardPosting } from "@/lib/jobs/sanitize";
import { extractSkills, flattenSkills } from "@/lib/skills";
import type { Job, RequirementImportance, WorkMode } from "@/types/job";
import { INDUSTRIES } from "./knowledge";
import { parseRequirements, sectionedLines } from "./requirements";

/** Everything a posting asks for, each item with the words it came from and how sure we are. */

export type RequirementKind = "skill" | "experience_years" | "responsibility" | "education" | "certification" | "qualification" | "language" | "authorization" | "clearance";

export interface RequirementItem {
  kind: RequirementKind;
  value: string;
  importance: RequirementImportance;
  /** The posting's own words. */
  evidence: string;
  /** 0 to 1. */
  confidence: number;
  lowConfidence: boolean;
}

export interface ExtractedRequirements {
  items: RequirementItem[];
  requiredYears: number | null;
  preferredYears: number | null;
  domains: string[];
  location: string;
  workArrangement: WorkMode;
  salary: Job["salary"];
  structured: boolean;
  /** Mean confidence of the skill items, 0 when none were read. */
  confidence: number;
  /** Sentences that read like instructions to an AI. They are left out of the analysis. */
  suspicious: string[];
}

export const LOW_CONFIDENCE = 0.6;

const EDUCATION = /\b(?:bachelor'?s?|master'?s?|ph\.?d|doctorate|degree|diploma|b\.?sc\.?|m\.?sc\.?|computer science)\b/i;
const CERTIFICATION = /\b(?:certifications?|certified|certificate|licen[sc]e|PMP|CSM|AZ-\d{3}|DP-\d{3})\b/i;
const OPTIONAL = /\boptional(?:ly)?\b|\bnot required\b/i;
const YEARS = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b/i;

type ExtractableJob = Pick<Job, "title" | "description"> & Partial<Pick<Job, "location" | "workMode" | "salary" | "descriptionTruncated">>;

export function extractRequirements(job: ExtractableJob): ExtractedRequirements {
  const guard = guardPosting(job.description);
  const description = guard.clean;
  const parsed = parseRequirements(job.title, description);
  const items: RequirementItem[] = [];
  const seen = new Set<string>();
  const add = (kind: RequirementKind, value: string, importance: RequirementImportance, evidence: string, confidence: number) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const c = Math.round(Math.max(0, confidence) * 100) / 100;
    items.push({ kind, value, importance, evidence: evidence.slice(0, 300), confidence: c, lowConfidence: c < LOW_CONFIDENCE });
  };
  // A cut-off posting is read with less certainty: the missing part may change what is required.
  const cut = job.descriptionTruncated ? 0.15 : 0;
  const required = new Set(parsed.required.map((s) => s.toLowerCase()));

  let preferredYears: number | null = null;
  for (const { line, section, preferred } of sectionedLines(description)) {
    const importance: RequirementImportance = OPTIONAL.test(line) ? "optional" : preferred ? "preferred" : "required";
    const base = (section === "required" || section === "preferred" ? 0.9 : section === "duties" ? 0.65 : preferred ? 0.8 : 0.5) - cut;
    for (const skill of flattenSkills(extractSkills(line))) {
      // parseRequirements settles required against preferred: a skill asked for both ways is required, so the
      // preferred mention is passed over and the required line supplies the evidence.
      if (importance !== "required" && required.has(skill.toLowerCase())) continue;
      add("skill", skill, importance, line, base);
    }
    const years = /experience|background/i.test(line) ? Number(line.match(YEARS)?.[1] ?? 0) : 0;
    if (years > 0 && years <= 30) {
      add("experience_years", String(years), importance, line, base);
      if (importance !== "required") preferredYears = Math.max(preferredYears ?? 0, years);
    }
    if (EDUCATION.test(line)) add("education", line.slice(0, 160), importance, line, base);
    if (CERTIFICATION.test(line)) add("certification", line.slice(0, 160), importance, line, base);
    if (section === "duties") add("responsibility", line.slice(0, 160), "required", line, 0.85 - cut);
    else if (section === "required" && !flattenSkills(extractSkills(line)).length && !EDUCATION.test(line)) add("qualification", line.slice(0, 160), importance, line, 0.7 - cut);
  }
  // Skills named only in the title are still core to the role.
  for (const skill of flattenSkills(extractSkills(job.title))) add("skill", skill, "required", job.title, 0.8);

  for (const s of detectEligibility(`${job.title}\n${description}`)) {
    const kind: RequirementKind = s.gate === "language" ? "language" : s.gate === "clearance" ? "clearance" : "authorization";
    add(kind, s.gate === "language" ? s.language : s.gate, "required", s.evidence, 0.85 - cut);
  }

  const skills = items.filter((i) => i.kind === "skill");
  return {
    items,
    requiredYears: parsed.requiredYears,
    preferredYears,
    domains: INDUSTRIES.filter((i) => i.pattern.test(`${job.title}\n${description}`)).map((i) => i.label),
    location: job.location ?? "",
    workArrangement: job.workMode ?? "Not stated",
    salary: job.salary ?? null,
    structured: parsed.structured,
    confidence: skills.length ? skills.reduce((n, i) => n + i.confidence, 0) / skills.length : 0,
    suspicious: guard.suspicious,
  };
}
