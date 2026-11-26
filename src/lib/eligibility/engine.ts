import type { CandidateFacts, ClearanceLevel, EligibilityCheck, EligibilityResult, EligibilityStatus, LanguageLevel } from "@/types/job";
import { detectEligibility, type Statement } from "./detect";
import { checkQualifications, type Qualifications } from "./qualifications";

/**
 * Gates run before a job is recommended. A job fails only when the posting states a condition AND the
 * candidate has stated a fact that contradicts it. Anything unknown is needs_verification.
 */

const CLEARANCE_RANK: Record<ClearanceLevel, number> = { none: 0, reliability: 1, secret: 2, top_secret: 3 };
const CLEARANCE_NAME: Record<ClearanceLevel, string> = { none: "no clearance", reliability: "Reliability status", secret: "Secret", top_secret: "Top Secret" };
const LANGUAGE_RANK: Record<LanguageLevel, number> = { basic: 1, intermediate: 2, professional: 3, fluent: 4, native: 5 };
const AUTH_NAME = { citizen: "Canadian citizen", permanent_resident: "permanent resident", work_permit: "work permit holder", needs_sponsorship: "needs sponsorship" } as const;

function check(s: Statement, facts: CandidateFacts): EligibilityCheck {
  const make = (status: EligibilityStatus, note: string, candidateEvidence: string | null): EligibilityCheck => ({
    gate: s.gate,
    status,
    postingEvidence: s.evidence,
    candidateEvidence,
    note,
  });
  const auth = facts.workAuthorization ?? null;
  const said = auth ? `You stated: ${AUTH_NAME[auth]}` : null;

  switch (s.gate) {
    case "citizenship": {
      const needs = s.allows.length > 1 ? "citizenship or permanent residency" : "citizenship";
      if (s.country === "other") return make("needs_verification", `The posting asks for ${needs} of another country. Your settings only cover Canada.`, null);
      if (!auth) return make("needs_verification", `The posting asks for ${needs}. Add your work status in Settings to check this.`, null);
      return (s.allows as string[]).includes(auth) ? make("eligible", `Meets the ${needs} requirement.`, said) : make("not_eligible", `The posting requires ${needs}.`, said);
    }
    case "work_authorization": {
      if (s.country === "other") return make("needs_verification", "The posting asks for authorization to work in another country.", null);
      if (!auth) return make("needs_verification", "The posting requires authorization to work. Add your work status in Settings to check this.", null);
      return auth === "needs_sponsorship"
        ? make("not_eligible", "The posting requires existing authorization to work in Canada.", said)
        : make("eligible", "You are authorized to work in Canada.", said);
    }
    case "sponsorship": {
      if (!auth) return make("needs_verification", "The posting offers no sponsorship. Add your work status in Settings to check this.", null);
      return auth === "needs_sponsorship" ? make("not_eligible", "The posting does not sponsor, and you need sponsorship.", said) : make("eligible", "No sponsorship is needed.", said);
    }
    case "clearance": {
      const asked = s.level ? `${CLEARANCE_NAME[s.level]} clearance` : "a security clearance";
      const mine = facts.clearance ?? null;
      if (!mine) return make("needs_verification", `The posting mentions ${asked}. Add your clearance in Settings to check this.`, null);
      const holds = `You stated: ${CLEARANCE_NAME[mine]}`;
      if (s.level && CLEARANCE_RANK[mine] >= CLEARANCE_RANK[s.level]) return make("eligible", `Your clearance meets ${asked}.`, holds);
      if (!s.level) return make("needs_verification", "The posting does not say which clearance level it needs.", holds);
      return s.obtainable
        ? make("needs_verification", `You do not hold ${asked}. The posting may accept someone who can obtain it.`, holds)
        : make("not_eligible", `The posting requires an existing ${asked}.`, holds);
    }
    case "language": {
      const list = facts.languages ?? [];
      if (!list.length) return make("needs_verification", `The posting requires ${s.language}. Add your languages in Settings to check this.`, null);
      const have = list.find((l) => l.language.trim().toLowerCase() === s.language.toLowerCase());
      if (!have) return make("not_eligible", `The posting requires ${s.language}, which is not among your languages.`, `You listed: ${list.map((l) => l.language).join(", ")}`);
      const need = s.bar === "fluent" ? LANGUAGE_RANK.fluent : s.bar === "professional" ? LANGUAGE_RANK.professional : 0;
      const stated = `You stated: ${have.language} (${have.level})`;
      return LANGUAGE_RANK[have.level] >= need
        ? make("eligible", `You work in ${s.language}.`, stated)
        : make("needs_verification", `The posting's bar for ${s.language} may be higher than your level.`, stated);
    }
  }
}

export function checkEligibility(
  title: string,
  description: string,
  facts: CandidateFacts = {},
  qualifications?: Omit<Qualifications, "complete">,
  now = new Date(),
): EligibilityResult {
  const checks = [
    ...detectEligibility(`${title}\n${description}`).map((s) => check(s, facts)),
    ...(qualifications ? checkQualifications(description, { ...qualifications, complete: facts.qualificationsComplete === true }, now) : []),
  ];
  // Advisory and preference checks are shown, but never decide the job's standing.
  const deciding = checks.filter((c) => !c.advisory && c.status !== "preferred_missing");
  const failed = deciding.filter((c) => c.status === "not_eligible");
  const unknown = deciding.filter((c) => c.status === "needs_verification");
  if (failed.length) return { status: "not_eligible", checks, reason: failed.map((c) => c.note).join(" ") };
  if (unknown.length) return { status: "needs_verification", checks, reason: unknown.map((c) => c.note).join(" ") };
  if (deciding.length) return { status: "eligible", checks, reason: "You meet the conditions the posting states." };
  if (checks.length) return { status: "not_applicable", checks, reason: "Nothing the posting requires outright rules you in or out. See the notes." };
  return { status: "not_applicable", checks, reason: "No eligibility condition could be read in the posting. That is not confirmation that none applies." };
}
