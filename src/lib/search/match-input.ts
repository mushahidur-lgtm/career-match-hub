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
          // Roles you are willing to move into are roles you are aiming for.
          roles: [...preferences.primaryRoles, ...preferences.secondaryRoles, ...(preferences.transitionRoles ?? [])],
          primaryRoles: preferences.primaryRoles,
          secondaryRoles: preferences.secondaryRoles,
          transitionRoles: preferences.transitionRoles,
          excludedRoles: preferences.excludedRoles,
        }
      : undefined,
    weights: preferences?.weights,
    facts: preferences?.facts,
  };
}
