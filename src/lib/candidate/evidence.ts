import { splitSections } from "@/lib/resume-sections";
import { skillPattern } from "@/lib/skills";
import type { EvidenceLevel, EvidenceRef, ResumeSection } from "@/types/job";

/**
 * Reads, line by line, how strongly a resume shows each skill. Where a line sits and what it says decide the
 * level: a skills list is "listed" wherever it appears, and only work under an employer is "professional".
 * No durations or proficiency levels are ever derived.
 */

/** Share of full credit each level earns. Starting assumptions, locked by tests/scenarios.test.ts. */
export const EVIDENCE_CREDIT: Record<EvidenceLevel, number> = {
  professional: 1,
  project: 0.7,
  learning: 0.4,
  listed: 0.25,
  missing: 0,
};

const RANK: Record<EvidenceLevel, number> = { professional: 4, project: 3, learning: 2, listed: 1, missing: 0 };

export interface ResumeLine {
  text: string;
  section: ResumeSection;
  level: Exclude<EvidenceLevel, "missing">;
}

const SKILLS_LINE = /^(?:technical |core |key )?(?:skills|technologies|tools|competencies)\b/i;
const LEARNING = /\b(?:in progress|currently (?:learning|studying|taking)|learning|studying|coursework|courses?|bootcamp|self[- ]study|tutorials?|certification pending)\b/i;
const PERSONAL = /\b(?:personal|side|hobby|academic|capstone|class|school|university) project\b/i;
const ACTION = /^(?:built|developed|designed|created|implemented|led|managed|maintained|automated|delivered|migrated|integrated|wrote|tuned|deployed|architected|modelled|modeled|optimi[sz]ed|supported|configured|refactored|launched|owned|analy[sz]ed|administered|mentored|coordinated|reduced|improved)\b/i;
const DATED = /(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:[a-z]{3,9}\.?\s+)?(?:19|20)\d{2}|present|current|now|today|ongoing)/i;

const bare = (line: string) => line.replace(/^[-•*–·]\s*/, "").trim();

/** A line that only names things: "Skills: Python, SQL" or a comma run with no verb. */
function isSkillList(line: string): boolean {
  if (SKILLS_LINE.test(line)) return true;
  const commas = line.match(/[,|•]/g)?.length ?? 0;
  return commas >= 4 && !ACTION.test(line) && !/\b(?:to|for|using|with)\b/i.test(line);
}

export function resumeLines(resumeText: string): ResumeLine[] {
  const out: ResumeLine[] = [];
  const sections = splitSections(resumeText);
  for (const [name, lines] of Object.entries(sections) as [keyof typeof sections, string[]][]) {
    let underDatedJob = false;
    for (const raw of lines) {
      const text = bare(raw);
      if (!text) continue;
      if (DATED.test(text)) underDatedJob = true;
      let level: ResumeLine["level"];
      if (name === "skills" || isSkillList(text)) level = "listed";
      else if (LEARNING.test(text) || name === "education" || name === "certifications") level = "learning";
      else if (name === "projects" || PERSONAL.test(text)) level = "project";
      else if (name === "experience") level = "professional";
      else if (name === "summary") level = "listed";
      // Resumes without headings: work under a dated job is professional. A described piece of work with no
      // employer or dates shows use of the skill, but not that it was paid work.
      else if (underDatedJob) level = "professional";
      else level = ACTION.test(text) || /\.\s+(?:Built|Developed|Designed|Led|Managed)\b/.test(text) ? "project" : "listed";
      out.push({ text, section: name, level });
    }
  }
  return out;
}

/** Using any of these is using the broader skill itself, not merely something similar to it. */
export const IMPLIED_BY: Record<string, string[]> = {
  SQL: ["T-SQL", "PL/SQL", "SQL Server", "PostgreSQL", "MySQL", "Azure SQL"],
};

export interface SkillEvidence {
  level: EvidenceLevel;
  refs: EvidenceRef[];
}

/**
 * The best evidence for a skill the candidate has on their profile. `onProfile` false means missing: the
 * profile is the candidate's confirmed skill list, so a skill they removed is not counted.
 */
export function skillEvidence(skill: string, lines: ResumeLine[], onProfile: boolean, implied: string[] = []): SkillEvidence {
  if (!onProfile) return { level: "missing", refs: [] };
  const patterns = [skill, ...implied].map((s) => skillPattern(s));
  const hits = lines.filter((l) => patterns.some((p) => p.test(l.text)));
  if (!hits.length) return { level: "listed", refs: [] };
  hits.sort((a, b) => RANK[b.level] - RANK[a.level]);
  return {
    level: hits[0].level,
    refs: hits.filter((h) => h.level === hits[0].level).slice(0, 2).map((h) => ({ section: h.section, quote: h.text.slice(0, 220) })),
  };
}
