import { profileSkills } from "@/lib/heuristics";
import { freshness } from "@/lib/job-meta";
import { CONCEPTS } from "@/lib/matching/knowledge";
import { parseRequirements } from "@/lib/matching/requirements";
import { splitSections } from "@/lib/resume-sections";
import { canonicalSkill, dedupe, skillPattern } from "@/lib/skills";
import type { CandidateProfile, Job, MatchDetail } from "@/types/job";

export interface ResumeAdvice {
  /** Lines copied from your resume that speak to this job, strongest first. */
  leadWith: { line: string; why: string }[];
  /** Skills the job asks for that are on your profile but not written in your resume text. */
  keywordsToAdd: { keyword: string; note: string }[];
  /** Relevant lines that state no number, scale or result. */
  weakBullets: { line: string; note: string }[];
  /** Lines from your projects section that fit this job. */
  projects: string[];
  /** What the job needs that your resume does not show, stated plainly. */
  gaps: { skill: string; kind: "missing" | "related"; note: string }[];
  notes: string[];
}

const MAX_LEAD = 5;
const clean = (l: string) => l.replace(/^[•*\-–]\s*/, "").trim();
const DATED = /(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:19|20)\d{2}|present|current)/i;
const HAS_RESULT = /\d|%|\$|\b(?:reduced|increased|improved|saved|cut|doubled|tripled)\b/i;

interface Scored {
  line: string;
  hits: string[];
  concepts: number;
  score: number;
}

function scoreLines(lines: string[], skills: string[], conceptIds: Set<string>): Scored[] {
  const patterns = skills.map((s) => ({ s, re: skillPattern(s) }));
  return lines
    .map((line) => {
      const hits = patterns.filter((p) => p.re.test(line)).map((p) => p.s);
      const concepts = CONCEPTS.filter((c) => conceptIds.has(c.id) && (line.match(c.pattern)?.length ?? 0) > 0).length;
      return { line, hits, concepts, score: hits.length + 0.5 * concepts };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function adviseResume(job: Pick<Job, "title" | "description">, profile: CandidateProfile, resumeText: string | null, detail?: MatchDetail | null): ResumeAdvice {
  const req = parseRequirements(job.title, job.description);
  const mine = new Set(profileSkills(profile.skills).map((s) => s.toLowerCase()));
  const has = (skill: string) => mine.has(canonicalSkill(skill).toLowerCase());
  const advice: ResumeAdvice = { leadWith: [], keywordsToAdd: [], weakBullets: [], projects: [], gaps: [], notes: [] };

  /* honest gaps: from the match when we have it, otherwise computed here */
  const missing = detail ? detail.requiredMissing : req.required.filter((s) => !has(s));
  for (const skill of missing) {
    advice.gaps.push({ skill, kind: "missing", note: "Not on your profile. Add it only if you have real experience with it." });
  }
  for (const t of detail?.transferable ?? []) {
    advice.gaps.push({ skill: t.skill, kind: "related", note: `You have ${t.via}. If you have not used ${t.skill}, present ${t.via} as related experience rather than claiming ${t.skill}.` });
  }
  for (const g of detail?.experienceGaps ?? []) advice.notes.push(g);

  if (!resumeText?.trim()) {
    advice.notes.push("Add your resume text on the Resume and profile page to get suggestions drawn from your own lines.");
    return advice;
  }

  const sections = splitSections(resumeText);
  const experience = (sections.experience.length ? sections.experience : [...sections.other, ...sections.summary])
    .map(clean)
    .filter((l) => l.length >= 25 && !DATED.test(l) && (l.match(/,/g)?.length ?? 0) < 5);
  const projectLines = sections.projects.map(clean).filter((l) => l.length >= 25);

  const jobSkills = dedupe([...req.required, ...req.preferred]);
  const jobConcepts = new Set(CONCEPTS.filter((c) => (`${job.title}\n${req.duties}`.match(c.pattern)?.length ?? 0) > 0).map((c) => c.id));

  const ranked = scoreLines(experience, jobSkills, jobConcepts);
  advice.leadWith = ranked.slice(0, MAX_LEAD).map((x) => ({
    line: x.line,
    why: x.hits.length ? `Mentions ${x.hits.slice(0, 4).join(", ")}${x.hits.length > 4 ? " and more" : ""}.` : "Describes the kind of work this job centres on.",
  }));

  advice.weakBullets = ranked
    .filter((x) => !HAS_RESULT.test(x.line))
    .slice(0, 3)
    .map((x) => ({ line: x.line, note: "States no number, scale or result. If you have one, add it. Do not guess." }));

  advice.projects = scoreLines(projectLines, jobSkills, jobConcepts).slice(0, 3).map((x) => x.line);

  /* keywords: only skills you list that the resume text does not actually say */
  for (const skill of jobSkills) {
    if (!has(skill)) continue;
    if (skillPattern(skill).test(resumeText)) continue;
    advice.keywordsToAdd.push({
      keyword: skill,
      note: req.required.includes(skill)
        ? "The job requires it and it is on your profile, but your resume text never mentions it. Name it where you used it."
        : "The job prefers it and it is on your profile, but your resume text never mentions it.",
    });
  }

  if (!advice.leadWith.length) advice.notes.push("None of your resume lines speak directly to this job's skills or work. That matches the low score.");
  return advice;
}

/* ---------- application preparation, from the rules alone ---------- */

export interface PrepSummary {
  whyApply: string;
  leadWith: string[];
  beReadyFor: string[];
  confirmFirst: string[];
  checklist: string[];
}

/** A preparation summary built only from the match and your resume lines. Claude can add a tailored version on top. */
export function buildPrepSummary(job: Job, advice: ResumeAdvice, now = new Date()): PrepSummary {
  const detail = job.match?.detail;
  const confirm: string[] = [];
  const fr = freshness(job.postedAt, now);
  if (fr.note) confirm.push(fr.note);
  if (fr.level === "unknown") confirm.push("The posting has no date, so check that it is still open.");
  if (detail?.location.status === "no" || detail?.location.status === "partial") confirm.push(detail.location.note);
  if (detail?.salary.status === "below") confirm.push(detail.salary.note);
  if (!job.salary) confirm.push("No salary is stated. Ask for the range early.");
  else if (job.salary.estimated) confirm.push("The salary shown was only estimated by the job board. Ask for the real range early.");
  if (detail?.seniority.status === "stretch") confirm.push(detail.seniority.note);

  const ready = [
    ...advice.gaps.filter((g) => g.kind === "missing").map((g) => `${g.skill} is asked for and is not on your profile. Be ready to say so honestly and what you have instead.`),
    ...advice.gaps.filter((g) => g.kind === "related").map((g) => `${g.skill}: you have the related ${g.note.match(/You have ([^.]+)\./)?.[1] ?? "skill"}.`),
    ...advice.notes.filter((n) => /years|roles on your resume/.test(n)),
  ].slice(0, 5);

  const checklist = [
    advice.leadWith.length ? "Put your strongest relevant lines first in the resume you send." : "Review your resume against the posting before sending it.",
    ...advice.keywordsToAdd.slice(0, 2).map((k) => `Name ${k.keyword} where you really used it.`),
    ...(advice.weakBullets.length ? ["Add a real number or result to your relevant bullets if you have one."] : []),
    ...(fr.level === "stale" || fr.level === "unknown" ? ["Confirm the posting is still open."] : []),
    "Apply on the employer's page and mark the job as Applied here.",
  ];

  return {
    whyApply: detail?.explanation ?? "Add a resume to see how this job fits.",
    leadWith: advice.leadWith.slice(0, 3).map((l) => l.line),
    beReadyFor: ready,
    confirmFirst: dedupe(confirm),
    checklist,
  };
}
