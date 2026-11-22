import type { CandidateProfile, EducationEntry, WorkEntry } from "@/types/job";
import { dedupe } from "@/lib/skills";

/* ---------- sections ---------- */

type SectionName = "summary" | "experience" | "education" | "skills" | "certifications" | "projects" | "other";

const HEADINGS: [SectionName, RegExp][] = [
  ["summary", /^(?:professional |career |executive )?(?:summary|profile|objective|about me)\b/i],
  ["experience", /^(?:(?:work|professional|relevant|employment|career) )?(?:experience|history)\b|^employment\b/i],
  ["education", /^(?:education|academic)\b/i],
  ["skills", /^(?:technical |core |key )?(?:skills|technologies|competencies)\b/i],
  ["certifications", /^(?:certifications?|licen[sc]es?|training|courses|professional development)\b/i],
  ["projects", /^(?:projects?|selected projects|publications|awards|volunteer)\b/i],
];

function headingOf(line: string): SectionName | null {
  const bare = line.trim().replace(/[:\s]+$/, "");
  if (!bare || bare.length > 45) return null;
  for (const [name, re] of HEADINGS) if (re.test(bare) && bare.split(/\s+/).length <= 5) return name;
  return null;
}

export function splitSections(text: string): Record<SectionName, string[]> {
  const out: Record<SectionName, string[]> = { summary: [], experience: [], education: [], skills: [], certifications: [], projects: [], other: [] };
  let current: SectionName = "other";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = headingOf(line);
    if (h) {
      current = h;
      continue;
    }
    // "Skills: Python, SQL" starts the skills section and carries its content on the same line.
    const inline = line.match(/^([A-Za-z][A-Za-z &/-]{2,30}):\s*(\S.*)$/);
    const inlineSection = inline ? headingOf(inline[1]) : null;
    if (inline && inlineSection) {
      current = inlineSection;
      out[current].push(inline[2]);
      continue;
    }
    out[current].push(line);
  }
  return out;
}

/* ---------- dates ---------- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}|\\d{1,2}\\/(?:19|20)\\d{2}`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|\\u2013|\\u2014|to)\\s*(${DATE}|present|current|now|today|ongoing)`, "i");

/** "Mar 2019" or "03/2019" become "2019-03"; a bare year stays "2019". */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, "");
  const slash = s.match(/^(\d{1,2})\/((?:19|20)\d{2})$/);
  if (slash) return `${slash[2]}-${String(Number(slash[1])).padStart(2, "0")}`;
  const named = s.match(new RegExp(`^(${MONTH})\\s+((?:19|20)\\d{2})$`, "i"));
  if (named) {
    const idx = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    return idx >= 0 ? `${named[2]}-${String(idx + 1).padStart(2, "0")}` : named[2];
  }
  const year = s.match(/^((?:19|20)\d{2})$/);
  return year ? year[1] : null;
}

const toMonths = (d: string): number => {
  const [y, m] = d.split("-");
  return Number(y) * 12 + (m ? Number(m) - 1 : 0);
};

/** Total time employed in whole years, counting overlapping jobs once. Null when no dates are known. */
export function yearsFromHistory(history: WorkEntry[], now = new Date()): number | null {
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const e of history) {
    if (!e.start) continue;
    const s = toMonths(e.start);
    const end = e.current || !e.end ? nowMonths : toMonths(e.end);
    if (end > s && end - s < 60 * 12) spans.push([s, Math.min(end, nowMonths)]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [s, e] of spans) {
    total += Math.max(0, e - Math.max(s, cursor));
    cursor = Math.max(cursor, e);
  }
  return Math.max(1, Math.round(total / 12));
}

/* ---------- work history ---------- */

const TITLE_WORD = /\b(?:engineer|developer|analyst|manager|architect|consultant|specialist|lead|director|administrator|scientist|intern|officer|programmer|designer|coordinator|associate|technician|owner|head|vp|president|supervisor|advisor|executive)\b/i;

function splitHeadline(text: string): { title: string; company: string } {
  const cleaned = text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^[\s\-•*|,;:–—]+|[\s\-•*|,;:–—]+$/g, "")
    .replace(/\s+/g, " ");
  const pieces = cleaned
    .split(/\s*(?:\||—|–|\s-\s|,|\s@\s|\sat\s)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const title = pieces.find((p) => TITLE_WORD.test(p)) ?? "";
  const company = pieces.find((p) => p !== title && !TITLE_WORD.test(p)) ?? (title ? "" : pieces[0] ?? "");
  return { title, company };
}

export function parseWorkHistory(text: string): WorkEntry[] {
  const sections = splitSections(text);
  const lines = sections.experience.length ? sections.experience : [...sections.other, ...sections.summary];
  const entries: WorkEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = RANGE.exec(lines[i]);
    if (!m) continue;
    // Bullet text that happens to contain two years is not a job heading.
    if (/^[•*-]\s/.test(lines[i]) && lines[i].length > 90) continue;
    const start = normalizeDate(m[1]);
    const endRaw = m[2].toLowerCase();
    const current = /present|current|now|today|ongoing/.test(endRaw);
    const end = current ? null : normalizeDate(m[2]);
    if (!start || (!current && !end)) continue;

    let head = lines[i].replace(RANGE, " ");
    let { title, company } = splitHeadline(head);
    if (!title && !company) {
      // Dates on their own line: the job and employer are on the lines just above.
      head = [lines[i - 2], lines[i - 1]].filter((l): l is string => !!l && !RANGE.test(l) && l.length < 90).join(", ");
      ({ title, company } = splitHeadline(head));
    }
    if (!title && !company) continue;
    entries.push({ title, company, start, end, current });
  }
  return entries.slice(0, 40);
}

/* ---------- education ---------- */

const DEGREE = /\b(?:bachelor(?:'s)?|master(?:'s)?|doctorate|ph\.?\s?d|b\.?\s?sc|m\.?\s?sc|b\.?\s?eng|m\.?\s?eng|b\.?\s?comm?|mba|b\.?a\.?|m\.?a\.?|b\.?s\.?|m\.?s\.?|associate degree|diploma|advanced diploma)\b/i;
const SCHOOL = /\b(?:universit(?:y|é)|college|institute|school|polytechni\w*|academy|collège|cegep)\b/i;

export function parseEducation(text: string): EducationEntry[] {
  const sections = splitSections(text);
  const lines = sections.education;
  const out: EducationEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasDegree = DEGREE.test(line);
    const hasSchool = SCHOOL.test(line);
    if (!hasDegree && !hasSchool) continue;
    const year = [...`${line} ${lines[i + 1] ?? ""}`.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => m[1]).pop() ?? null;
    const clean = (s: string) => s.replace(/\((?:19|20)\d{2}[^)]*\)|\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
    const pieces = line.split(/\s*(?:\||—|–|\s-\s|,)\s*/).map(clean).filter(Boolean);
    let credential = pieces.find((p) => DEGREE.test(p)) ?? "";
    let institution = pieces.find((p) => SCHOOL.test(p)) ?? "";
    if (!institution && credential && lines[i + 1] && SCHOOL.test(lines[i + 1]) && !DEGREE.test(lines[i + 1])) {
      institution = clean(lines[i + 1].split(/\s*(?:\||—|–|\s-\s|,)\s*/)[0]);
      i++;
    }
    if (!credential && institution && lines[i + 1] && DEGREE.test(lines[i + 1])) {
      credential = clean(lines[i + 1].split(/\s*(?:\||—|–|\s-\s|,)\s*/)[0]);
      i++;
    }
    if (credential || institution) out.push({ credential, institution, year });
  }
  return out.slice(0, 15);
}

/* ---------- certifications ---------- */

const CERT_NAMES =
  /\b(?:AWS Certified [A-Za-z0-9 –-]+?(?=[,;.(\n]|$)|Microsoft Certified:? [A-Za-z0-9 –-]+?(?=[,;.(\n]|$)|Databricks Certified [A-Za-z0-9 –-]+?(?=[,;.(\n]|$)|Google (?:Professional )?Cloud [A-Za-z ]+ (?:Engineer|Architect|Developer)|SnowPro [A-Za-z ]+|CompTIA [A-Za-z0-9+]+|(?:PMP|CISSP|CISA|CISM|CSM|PSM(?: I{1,3})?|CCNA|CCNP|ITIL(?: ?v?\d)?|CKA|CKAD|TOGAF)\b)/gi;

export function parseCertifications(text: string): string[] {
  const sections = splitSections(text);
  const fromSection = sections.certifications
    .map((l) => l.replace(/^[•*\-–]\s*/, "").trim())
    .filter((l) => l.length >= 3 && l.length <= 120);
  const found = [...text.matchAll(CERT_NAMES)].map((m) => m[0].replace(/\s+/g, " ").trim());
  const all = dedupe([...fromSection, ...found]);
  const key = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keep = all.filter((c, i) => !all.some((o, j) => j !== i && key(o).length > key(c).length && key(o).startsWith(key(c))));
  return keep.slice(0, 30);
}

/* ---------- keeping Claude honest ---------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 2);

function coverage(phrase: string, haystack: string): number {
  const w = words(phrase);
  if (!w.length) return 0;
  const hay = ` ${norm(haystack)} `;
  return w.filter((t) => hay.includes(` ${t} `) || hay.includes(` ${t}`)).length / w.length;
}

const appears = (phrase: string, haystack: string) => !!phrase.trim() && ` ${norm(haystack)} `.includes(` ${norm(phrase)} `);

const yearInText = (year: string | null, haystack: string) => !!year && new RegExp(`(?<!\\d)${year.slice(0, 4)}(?!\\d)`).test(haystack);

/**
 * Keeps only what the resume text supports. A job needs its employer and most of its title to
 * appear, and a date is kept only if its year appears. Schools, certificates and roles need their
 * words to appear. Anything else Claude listed is dropped, so the profile cannot claim more than
 * the resume says.
 */
export function verifyAgainstResume<T extends { work?: WorkEntry[]; education?: EducationEntry[]; certifications?: string[]; roles?: string[] }>(found: T, resumeText: string) {
  return {
    work: (found.work ?? [])
      .filter((e) => (e.company.trim() ? appears(e.company, resumeText) && (!e.title.trim() || coverage(e.title, resumeText) >= 0.6) : coverage(e.title, resumeText) >= 0.8))
      .map((e) => ({
        ...e,
        start: yearInText(e.start, resumeText) ? e.start : null,
        end: yearInText(e.end, resumeText) ? e.end : null,
      })),
    education: (found.education ?? [])
      .filter((e) => (e.institution.trim() ? appears(e.institution, resumeText) : coverage(e.credential, resumeText) >= 0.8))
      .map((e) => ({ ...e, year: yearInText(e.year, resumeText) ? e.year : null })),
    certifications: (found.certifications ?? []).filter((c) => coverage(c, resumeText) >= 0.8),
    roles: (found.roles ?? []).filter((r) => coverage(r, resumeText) >= 0.6),
  };
}

/** True for a profile saved before work history, education and certifications were read from the resume. */
export const lacksStructure = (p: CandidateProfile) => p.workHistory === undefined || p.education === undefined || p.certifications === undefined;

/**
 * Fills in only the sections a profile does not have yet, from the resume text. Skills, years,
 * level, roles and anything already edited are left exactly as they are.
 */
export function fillStructure(profile: CandidateProfile, resumeText: string): CandidateProfile {
  return {
    ...profile,
    workHistory: profile.workHistory ?? parseWorkHistory(resumeText),
    education: profile.education ?? parseEducation(resumeText),
    certifications: profile.certifications ?? parseCertifications(resumeText),
  };
}
