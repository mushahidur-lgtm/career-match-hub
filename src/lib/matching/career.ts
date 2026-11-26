/**
 * Career alignment comes only from what the candidate said they want: their primary and secondary roles and
 * their exclusions. Past titles and the resume do not count here.
 */
export interface CareerAlignment {
  score: number | null;
  note: string;
  role: string | null;
  excludedTerm: string | null;
}

const SECONDARY_WEIGHT = 0.8;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function careerAlignment(
  job: { title: string; description: string },
  preferences: { primaryRoles?: string[]; secondaryRoles?: string[]; roles?: string[] } | undefined,
  exclusions: string[],
  similarity: (title: string, roles: string[]) => number,
): CareerAlignment {
  const text = `${job.title}\n${job.description}`;
  const excludedTerm = exclusions.map((e) => e.trim()).find((e) => e.length >= 2 && new RegExp(`(?<![A-Za-z0-9])${escapeRe(e)}(?![A-Za-z0-9])`, "i").test(text)) ?? null;
  if (excludedTerm) return { score: 0, note: `The posting mentions "${excludedTerm}", which you excluded.`, role: null, excludedTerm };

  const primary = preferences?.primaryRoles ?? preferences?.roles ?? [];
  const secondary = preferences?.secondaryRoles ?? [];
  if (!primary.length && !secondary.length) return { score: null, note: "No target roles are set, so career alignment was not judged.", role: null, excludedTerm: null };

  let best = { value: 0, role: null as string | null, primary: true };
  for (const [roles, weight, isPrimary] of [[primary, 1, true], [secondary, SECONDARY_WEIGHT, false]] as const) {
    for (const role of roles) {
      const value = similarity(job.title, [role]) * weight;
      if (value > best.value) best = { value, role, primary: isPrimary };
    }
  }
  const score = Math.round(100 * best.value);
  const note = !best.role || best.value < 0.3
    ? "The title is not close to any role you said you want."
    : `${best.value >= 0.75 ? "Matches" : "Partly matches"} your ${best.primary ? "primary" : "secondary"} target "${best.role}".`;
  return { score, note, role: best.role, excludedTerm: null };
}
