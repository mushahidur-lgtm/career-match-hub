import type { Confidence, PostingStatus } from "@/types/job";

/**
 * How much the engine had to go on, 0 to 100. It describes the analysis, not the fit, and is never part of
 * the match score.
 */
export interface ConfidenceInput {
  descriptionLength: number;
  truncated: boolean;
  structured: boolean;
  requiredCount: number;
  /** Mean extraction confidence of the posting's skills, 0 to 1. */
  extractionConfidence: number;
  hasResumeText: boolean;
  hasWorkEvidence: boolean;
  yearsKnown: boolean;
  profileSkillCount: number;
  evidenceCount: number;
  judgedComponents: number;
  postingStatus: PostingStatus;
  aiApplied: boolean;
}

const STATUS_POINTS: Record<PostingStatus, number> = { retrieved: 5, partial: 0, unverified: -5, unreachable: -15, expired: -15 };

export function confidenceLabel(score: number): Confidence {
  return score >= 70 ? "high" : score >= 45 ? "medium" : "low";
}

export function assessConfidence(i: ConfidenceInput): { score: number; label: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  let pts = 0;
  const add = (points: number, reason: string) => {
    pts += points;
    reasons.push(reason);
  };

  if (i.descriptionLength >= 1200) add(20, "Full job description available.");
  else if (i.descriptionLength >= 500) add(12, "Moderate-length job description.");
  else add(3, "Short job description.");
  if (i.truncated) add(-10, "The job board only provides the first part of the posting.");

  if (i.structured) add(10, "Required and preferred skills could be told apart.");
  else add(0, "No requirements section found, so every skill is treated as required.");
  if (i.requiredCount >= 3) add(10, `${i.requiredCount} required skills found to compare.`);
  else add(i.requiredCount ? 4 : 0, "Few skills named in the posting.");
  pts += Math.round(10 * i.extractionConfidence);

  if (i.hasResumeText) add(15, "Compared against your full resume text.");
  else add(0, "Compared against your profile only, not the resume text.");
  if (i.hasWorkEvidence) add(10, "Your resume describes work that can be checked.");
  if (i.yearsKnown) add(5, "Your years of experience are known.");
  else add(0, "Your years of experience are unknown.");
  if (i.profileSkillCount >= 5) pts += 5;
  if (i.evidenceCount) pts += 5;
  if (i.judgedComponents >= 5) add(5, "Five or more parts of the match could be judged.");

  pts += STATUS_POINTS[i.postingStatus];
  if (i.postingStatus === "expired") reasons.push("The posting appears to be closed.");
  if (i.postingStatus === "unverified") reasons.push("The posting could not be verified.");
  if (i.aiApplied) add(5, "Claude reviewed the fit.");

  let score = Math.max(0, Math.min(100, pts));
  // With almost nothing to read in the posting, no amount of resume detail makes the result trustworthy.
  if (i.descriptionLength < 200 || (i.requiredCount === 0 && i.descriptionLength < 500)) score = Math.min(score, 35);
  return { score, label: confidenceLabel(score), reasons };
}
