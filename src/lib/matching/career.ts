import type { RoleRelation } from "@/types/job";

/**
 * Career alignment comes only from what the candidate said they want: primary, secondary and transition roles,
 * excluded roles and excluded words. Past titles and the resume do not count here.
 */
export interface CareerAlignment {
  score: number | null;
  note: string;
  role: string | null;
  /** direct: a primary target. adjacent: close to a target. transition: a move you said you would make. */
  relation: RoleRelation | null;
  excludedTerm: string | null;
  excludedRole: string | null;
}

const SECONDARY_WEIGHT = 0.8;
const TRANSITION_WEIGHT = 0.65;
const MATCHES = 0.75;
const PARTLY = 0.3;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface CareerPreferences {
  primaryRoles?: string[];
  secondaryRoles?: string[];
  transitionRoles?: string[];
  excludedRoles?: string[];
  roles?: string[];
}

export function careerAlignment(
  job: { title: string; description: string },
  preferences: CareerPreferences | undefined,
  exclusions: string[],
  similarity: (title: string, roles: string[]) => number,
): CareerAlignment {
  const none = { role: null, excludedTerm: null, excludedRole: null };
  const text = `${job.title}\n${job.description}`;
  const excludedTerm = exclusions.map((e) => e.trim()).find((e) => e.length >= 2 && new RegExp(`(?<![A-Za-z0-9])${escapeRe(e)}(?![A-Za-z0-9])`, "i").test(text)) ?? null;
  if (excludedTerm) return { ...none, score: 0, note: `The posting mentions "${excludedTerm}", which you excluded.`, relation: "unrelated", excludedTerm };
  const excludedRole = (preferences?.excludedRoles ?? []).find((r) => similarity(job.title, [r]) >= MATCHES) ?? null;
  if (excludedRole) return { ...none, score: 0, note: `This is a "${excludedRole}" role, which you excluded.`, relation: "unrelated", excludedRole };

  const primary = preferences?.primaryRoles ?? preferences?.roles ?? [];
  const secondary = preferences?.secondaryRoles ?? [];
  const transition = preferences?.transitionRoles ?? [];
  if (!primary.length && !secondary.length && !transition.length) {
    return { ...none, score: null, note: "No target roles are set, so career alignment was not judged.", relation: null };
  }

  const tiers = [
    [primary, 1, "primary"],
    [secondary, SECONDARY_WEIGHT, "secondary"],
    [transition, TRANSITION_WEIGHT, "transition"],
  ] as const;
  let best = { value: 0, raw: 0, role: null as string | null, tier: "primary" as "primary" | "secondary" | "transition" };
  for (const [roles, weight, tier] of tiers) {
    for (const role of roles) {
      const raw = similarity(job.title, [role]);
      if (raw * weight > best.value) best = { value: raw * weight, raw, role, tier };
    }
  }

  const relation: RoleRelation =
    best.raw < PARTLY ? "unrelated" : best.tier === "transition" ? "transition" : best.tier === "primary" && best.raw >= MATCHES ? "direct" : "adjacent";
  const note =
    relation === "unrelated"
      ? "The title is not close to any role you said you want."
      : relation === "transition"
        ? `A career move you said you would make: "${best.role}".`
        : `${best.raw >= MATCHES ? "Matches" : "Partly matches"} your ${best.tier} target "${best.role}".`;
  return { ...none, score: Math.round(100 * best.value), note, role: best.role, relation };
}
