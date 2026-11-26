import type { MatchInput } from "@/lib/matching/engine";
import type { CandidateProfile, SearchPreferences } from "@/types/job";

/** The one place stored settings become engine input, so the search route and the daily run cannot differ. */
export function toMatchInput(profile: CandidateProfile, resumeText: string | null, preferences?: SearchPreferences): MatchInput {
  return {
    profile,
    resumeText,
    preferences: preferences
      ? {
          locations: preferences.locations,
          minSalary: preferences.minSalary,
          roles: [...preferences.primaryRoles, ...preferences.secondaryRoles],
          primaryRoles: preferences.primaryRoles,
          secondaryRoles: preferences.secondaryRoles,
        }
      : undefined,
    weights: preferences?.weights,
    facts: preferences?.facts,
  };
}
