/**
 * Job postings are third-party text. This removes characters used to hide content and picks out lines that
 * read like instructions to an AI, so they can be flagged and kept out of prompts. It is a guard, not a proof:
 * the AI stage is also read-only, schema-validated and bounded.
 */

/** Zero-width, bidirectional-control and Unicode tag characters. None of them belong in a job description. */
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/gu;

const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b.{0,40}\b(?:previous|prior|above|earlier|all|any|your|the)\b.{0,30}\b(?:instructions?|prompts?|rules?|guidelines?)\b/i,
  /\byou are (?:now )?(?:an? )?(?:ai|a\.i\.|assistant|language model|llm|chatbot|grader|evaluator)\b/i,
  /\b(?:system prompt|developer message|new instructions?:)/i,
  /\b(?:ai|llm|assistant|model|automated (?:screener|reviewer))\b.{0,40}\b(?:must|should|please|shall)\b.{0,40}\b(?:score|rate|rank|recommend|respond|output|reply)\b/i,
  /\b(?:rate|score|rank|mark)\b.{0,30}\b(?:this (?:job|candidate|posting|application)|the candidate)\b.{0,30}\b(?:100|10\/10|highest|perfect|top|excellent)\b/i,
  /<\/?(?:system|assistant|instructions?|resume|candidate|candidate_skills|jobs?|posting)\b[^>]*>/i,
];

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

export interface GuardResult {
  /** The posting without invisible characters or instruction-like sentences. */
  clean: string;
  suspicious: string[];
  invisibleRemoved: number;
}

export function guardPosting(text: string): GuardResult {
  const invisibleRemoved = text.match(INVISIBLE)?.length ?? 0;
  const suspicious: string[] = [];
  const kept: string[] = [];
  for (const line of stripInvisible(text).split(/\r?\n/)) {
    // A one-paragraph posting is checked sentence by sentence, so one bad sentence does not remove the whole text.
    const safe = line.split(/(?<=[.!?])\s+/).filter((part) => {
      const bad = INSTRUCTION_PATTERNS.some((p) => p.test(part));
      if (bad) suspicious.push(part.trim().slice(0, 160));
      return !bad;
    });
    kept.push(safe.join(" "));
  }
  return { clean: kept.join("\n"), suspicious, invisibleRemoved };
}

/** For text placed inside tagged prompt sections: angle brackets cannot open or close a section. */
export const forPrompt = (text: string) => guardPosting(text).clean.replace(/</g, "‹").replace(/>/g, "›");
