import { dedupe, extractSkills, flattenSkills } from "@/lib/skills";

export interface ParsedRequirements {
  /** Skills the posting treats as necessary. A skill that appears as both required and preferred counts as required. */
  required: string[];
  preferred: string[];
  /** Minimum years of experience the posting asks for, if it says. */
  requiredYears: number | null;
  /** True when the posting has recognisable sections or preference wording, so the split can be trusted. */
  structured: boolean;
  /** The part of the posting that describes the work, for responsibility matching. */
  duties: string;
}

export type Section = "required" | "preferred" | "duties" | "other";

const HEADINGS: [Section, RegExp][] = [
  ["preferred", /^(?:nice[- ]to[- ]haves?|preferred(?: qualifications| skills)?|bonus(?: points)?|assets?|an asset|good to have|desirable|what (?:would|will) (?:set you apart|make you stand out)|extras?)\b/i],
  ["required", /^(?:requirements?|required(?: qualifications| skills)?|qualifications?|must[- ]haves?|what you(?:'|’)ll need|what you will need|what we(?:'|’)re looking for|what we are looking for|who you are|you have|skills and experience|about you|your profile|minimum qualifications)\b/i],
  ["duties", /^(?:responsibilit(?:y|ies)|what you(?:'|’)ll do|what you will do|duties|the role|your role|in this role|day[- ]to[- ]day|key accountabilities|about the (?:role|job|position))\b/i],
];

const PREFERRED_CUE = /\b(?:nice to have|preferred|an asset|assets?\b|bonus|is a plus|are a plus|a plus|desirable|good to have|ideally|would be (?:a|an) (?:asset|plus|bonus)|familiarity with|exposure to|working knowledge of)\b/i;

function splitLines(text: string): string[] {
  const rough = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // A posting delivered as one paragraph (Adzuna) is split into sentences instead.
  const lines = rough.length >= 4 ? rough : rough.flatMap((l) => l.split(/(?<=[.!?;])\s+(?=[A-Z••-])/));
  return lines.map((l) => l.replace(/^[••*\-–]\s*/, ""));
}

function headingOf(line: string): Section | null {
  const bare = line.replace(/[:\s]+$/, "");
  if (bare.length > 70) return null;
  const looksLikeHeading = /:\s*$/.test(line) || bare.split(/\s+/).length <= 8;
  if (!looksLikeHeading) return null;
  for (const [section, re] of HEADINGS) if (re.test(bare)) return section;
  return null;
}

/** Pulls the smallest year count from lines that talk about experience. */
export function requiredYearsIn(lines: string[]): number | null {
  let best: number | null = null;
  for (const line of lines) {
    if (!/experience|exp\.|background|working with|in a similar role/i.test(line)) continue;
    for (const m of line.matchAll(/(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?(?:years?|yrs?)\b/gi)) {
      const n = Number(m[1]);
      if (n > 0 && n <= 30 && (best === null || n > best)) best = n;
    }
  }
  return best;
}

export interface SectionedLine {
  line: string;
  section: Section;
  /** True when the line is in a preferred section, or carries preference wording outside a required one. */
  preferred: boolean;
  cuePreferred: boolean;
}

/** Every line of the posting with the section it sits in. Headings themselves are left out. */
export function sectionedLines(description: string): SectionedLine[] {
  const out: SectionedLine[] = [];
  let section: Section = "other";
  for (const line of splitLines(description)) {
    const heading = headingOf(line);
    if (heading) {
      section = heading;
      continue;
    }
    const cuePreferred = PREFERRED_CUE.test(line);
    out.push({ line, section, preferred: section === "preferred" || (cuePreferred && section !== "required"), cuePreferred });
  }
  return out;
}

export function parseRequirements(title: string, description: string): ParsedRequirements {
  const required: string[] = [];
  const preferred: string[] = [];
  const dutyLines: string[] = [];
  const requirementLines: string[] = [];
  let structured = splitLines(description).some((l) => headingOf(l) !== null);

  for (const { line, section, preferred: isPreferred, cuePreferred } of sectionedLines(description)) {
    if (cuePreferred) structured = true;
    const found = flattenSkills(extractSkills(line));
    (isPreferred ? preferred : required).push(...found);
    if (section === "duties" || section === "other") dutyLines.push(line);
    if (!isPreferred) requirementLines.push(line);
  }

  // Anything in the title is core to the role.
  required.push(...flattenSkills(extractSkills(title)));

  const reqSet = new Set(required.map((s) => s.toLowerCase()));
  return {
    required: dedupe(required),
    preferred: dedupe(preferred).filter((s) => !reqSet.has(s.toLowerCase())),
    requiredYears: requiredYearsIn(requirementLines.length ? requirementLines : splitLines(description)),
    structured,
    duties: dutyLines.join("\n") || description,
  };
}
