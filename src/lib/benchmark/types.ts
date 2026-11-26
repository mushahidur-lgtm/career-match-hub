import type { MatchInput } from "@/lib/matching/engine";
import type { CandidateFacts, EducationEntry, EligibilityStatus, EvidenceLevel, WorkMode } from "@/types/job";

/**
 * The shape of the matching benchmark. Labels are a human judgement written before the engine is run on a
 * scenario. They measure agreement with that judgement on invented data, not real-world hiring outcomes.
 */

/** apply: a reviewer would apply. consider: worth a look, with real gaps. no: should not be recommended. */
export type Tier = "apply" | "consider" | "no";

export type CaseKind =
  | "direct"
  | "strong_some_missing"
  | "transferable"
  | "wrong_specialization"
  | "keyword_overlap"
  | "seniority_mismatch"
  | "missing_mandatory"
  | "missing_certification"
  | "work_authorization"
  | "location_mismatch"
  | "incomplete"
  | "expired"
  | "ambiguous"
  | "career_transition"
  | "learning_only"
  | "adjacent_professional";

export interface Labels {
  tier: Tier;
  eligibility: EligibilityStatus;
  /** Technical skills the posting makes mandatory, as a careful reader would list them. */
  required: string[];
  /** Skills that must not be reported as matched (the candidate lacks them, or only has a relative). */
  notMatched?: string[];
  /** Expected evidence level for skills the posting asks for. */
  evidence?: Record<string, EvidenceLevel>;
  /** Mandatory degrees or certificates the candidate does not show. */
  missingQualifications?: string[];
}

export interface Scenario {
  id: string;
  candidate: string;
  category: string;
  kind: CaseKind;
  title: string;
  description: string;
  location?: string;
  workMode?: WorkMode;
  truncated?: boolean;
  /** Facts stated for this scenario only, on top of the candidate's own. */
  facts?: CandidateFacts;
  expect: Labels;
}

export interface BenchCandidate {
  id: string;
  label: string;
  input: MatchInput & { resumeText: string };
  education?: EducationEntry[];
}
