import type { Confidence, EligibilityStatus, PostingStatus, RecommendedAction } from "@/types/job";

export interface RecommendInput {
  score: number;
  confidence: Confidence;
  eligibility: EligibilityStatus;
  postingStatus: PostingStatus;
  missingRequired: number;
}

export function recommendedAction(i: RecommendInput): RecommendedAction {
  if (i.eligibility === "not_eligible" || i.postingStatus === "expired") return "not_recommended";
  if (i.eligibility === "needs_verification") return i.score >= 45 ? "verify_requirements" : "not_recommended";
  // Too little to go on: a promising result is something to check, not something to promise.
  if (i.confidence === "low") return i.score >= 45 ? "verify_requirements" : "not_recommended";
  if (i.score >= 75) return "strong_match";
  if (i.score >= 60) return "consider";
  if (i.score >= 45) return i.missingRequired > 0 ? "upskill" : "consider";
  return "not_recommended";
}
