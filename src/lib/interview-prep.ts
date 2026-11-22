import { profileSkills } from "@/lib/heuristics";
import { CONCEPTS } from "@/lib/matching/knowledge";
import { verifyQuotes } from "@/lib/matching/engine";
import { parseRequirements } from "@/lib/matching/requirements";
import { adviseResume } from "@/lib/resume-help";
import { canonicalSkill, dedupe } from "@/lib/skills";
import type { CandidateProfile, InterviewStage, Job } from "@/types/job";

export const PREP_DISCLAIMER =
  "These are practice prompts built from the posting. Interviewers may ask different questions, so treat this as preparation, not a prediction of what will be asked.";

export interface PrepSet {
  technical: string[];
  behavioural: string[];
  roleSpecific: string[];
  /** Lines copied from your resume that you could build an answer on. */
  stories: { line: string; why: string }[];
  structures: { name: string; steps: string[] }[];
  questionsToAsk: string[];
  topicsToReview: string[];
}

const CONCEPT_PROMPTS: Record<string, string> = {
  pipelines: "How would you design a reliable, incremental data pipeline, and how would you monitor it for failures?",
  warehouse: "How do you decide between a star schema and a wider denormalised table, and what does that cost you later?",
  bi: "How would you design a dashboard so that stakeholders trust the numbers on it?",
  analytics: "Walk me through how you would turn a vague business question into an analysis you can defend.",
  cloud: "How do you keep cost and security under control in a cloud environment?",
  backend: "How do you design an API so it can change without breaking the people who use it?",
  frontend: "How do you keep a front end fast and accessible as it grows?",
  devops: "What does a safe, repeatable deployment pipeline look like to you?",
  ml: "How would you decide whether a machine learning approach is worth using for this problem?",
  integration: "How do you build an integration between two systems that fail in different ways?",
  powerplatform: "When would you use a low-code platform for a problem, and when would you not?",
  governance: "How do you handle data quality, access control and privacy in your work?",
  delivery: "Tell me about a time you worked through stakeholders who wanted different things.",
  database: "How do you find and fix a slow query?",
};

const BEHAVIOURAL_BASE = [
  "Tell me about yourself and why this role interests you.",
  "Describe a project you are proud of and what your part in it was.",
  "Tell me about a time something you built failed or went wrong. What did you do?",
  "Tell me about a disagreement with a colleague and how it was resolved.",
];

const BY_STAGE: Partial<Record<InterviewStage, string[]>> = {
  "Recruiter screen": ["What are you looking for in your next role?", "What are your salary expectations, and how flexible are they?", "When could you start, and are you talking to other employers?"],
  "Hiring manager": ["What would you want to achieve in your first 90 days?", "How do you like to be managed, and how do you handle feedback?"],
  Technical: ["Describe a production problem you diagnosed. How did you find the cause?", "How do you review someone else's work?"],
  Behavioural: ["Tell me about a time you had to learn something quickly under pressure.", "Describe a time you changed your mind after new information."],
  Panel: ["How do you explain a technical decision to someone who is not technical?"],
  Final: ["Why should we choose you over another strong candidate?", "What questions do you still have about the role or the team?"],
};

const STRUCTURES = [
  { name: "STAR for a behavioural question", steps: ["Situation: the context in one or two sentences.", "Task: what you were responsible for.", "Action: what you did, and why you chose it.", "Result: what changed, with a number if you truly have one."] },
  { name: "For a technical question", steps: ["Clarify the problem and its limits first.", "Describe your approach in plain terms.", "Name the trade-offs and what you would give up.", "Say how you would test it and what could go wrong."] },
  { name: "For a gap in your experience", steps: ["Say plainly that you have not done it.", "Name the closest thing you have done.", "Explain how you would learn the rest and how fast."] },
];

const QUESTIONS_TO_ASK = [
  "What does success look like in this role after the first year?",
  "How is the team organised, and who would I work with most closely?",
  "What is the biggest challenge the team is working through right now?",
  "How are technical decisions made here, and how are they reviewed?",
  "What does the hiring process look like from here, and when do you expect to decide?",
];

/**
 * Practice prompts from the posting and your profile. Skill questions are asked about skills the
 * posting names. For one you have, the prompt asks about your experience; for one you lack, it asks
 * how you would get up to speed, so you are never prompted to claim experience you do not have.
 */
export function buildPracticeSet(job: Pick<Job, "title" | "description">, profile: CandidateProfile | null, resumeText: string | null, stage: InterviewStage = "Technical"): PrepSet {
  const req = parseRequirements(job.title, job.description);
  const mine = new Set((profile ? profileSkills(profile.skills) : []).map((s) => s.toLowerCase()));
  const has = (s: string) => mine.has(canonicalSkill(s).toLowerCase());
  // Gaps come first: they are what you most need to be ready to talk about.
  const gaps = req.required.filter((s) => !has(s));
  const skills = dedupe([...gaps.slice(0, 2), ...req.required]).slice(0, 6);

  const technical = skills.map((s) =>
    has(s)
      ? `Walk me through how you have used ${s}, and one decision about it you would make differently now.`
      : `${s} is part of this role and is not on your profile. How would you become productive with it quickly?`,
  );

  const concepts = CONCEPTS.filter((c) => (`${job.title}\n${req.duties}`.match(c.pattern)?.length ?? 0) > 0).slice(0, 5);
  const roleSpecific = concepts.map((c) => CONCEPT_PROMPTS[c.id]).filter(Boolean);

  const missing = gaps;
  const advice = profile ? adviseResume(job, profile, resumeText, null) : null;

  return {
    technical,
    behavioural: dedupe([...BEHAVIOURAL_BASE, ...(BY_STAGE[stage] ?? [])]).slice(0, 7),
    roleSpecific,
    stories: (advice?.leadWith ?? []).slice(0, 3),
    structures: STRUCTURES,
    questionsToAsk: [...QUESTIONS_TO_ASK, ...(missing[0] ? [`How important is ${missing[0]} in the first year, and how would I be supported in learning it?`] : [])].slice(0, 6),
    // A skill you lack is marked in place, so it appears once and cannot be cut by the limit.
    topicsToReview: dedupe([...skills.map((sk) => (has(sk) ? sk : `${sk} (a gap to prepare for)`)), ...concepts.map((c) => c.label)]).slice(0, 10),
  };
}

/* ---------- Claude's version, checked ---------- */

export interface AiPrep {
  technical: string[];
  behavioural: string[];
  roleSpecific: string[];
  answerOutlines: { question: string; outline: string[]; evidence: string }[];
  questionsToAsk: string[];
  topicsToReview: string[];
}

const PROMISES = /guarantee|will definitely|always (?:ask|asked)|certainly (?:ask|be asked)|you will be asked/i;
const clean = (s: string, n = 300) => s.replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Keeps Claude's prompts plain and honest. A quoted resume line must be in the resume, or it is
 * dropped, and anything worded as a promise of what will be asked is removed.
 */
export function verifyPrep(raw: AiPrep, resumeText: string): AiPrep {
  const list = (items: string[], n: number) => dedupe(items.map((i) => clean(i)).filter((i) => i && !PROMISES.test(i))).slice(0, n);
  return {
    technical: list(raw.technical, 8),
    behavioural: list(raw.behavioural, 6),
    roleSpecific: list(raw.roleSpecific, 6),
    answerOutlines: raw.answerOutlines
      .map((o) => ({
        question: clean(o.question),
        outline: o.outline.map((s) => clean(s, 250)).filter(Boolean).slice(0, 6),
        evidence: verifyQuotes([o.evidence], resumeText)[0] ?? "",
      }))
      .filter((o) => o.question && o.outline.length && !PROMISES.test(o.question))
      .slice(0, 5),
    questionsToAsk: list(raw.questionsToAsk, 6),
    topicsToReview: list(raw.topicsToReview, 8),
  };
}
