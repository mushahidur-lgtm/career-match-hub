import { SKILL_FAMILIES, SKILL_RELATIONS } from "./knowledge";

/** Related-skill credit. A related technology is never treated as the same one. */
export interface Transfer {
  skill: string;
  via: string;
  credit: number;
  why: string;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Every related skill the candidate has that says something about `skill`. */
export function transfersFor(skill: string, has: (s: string) => boolean): Transfer[] {
  const out: Transfer[] = [];
  for (const r of SKILL_RELATIONS) {
    // "C# implies some .NET" and the reverse are different claims, so relations run one way for languages and frameworks.
    const reversible = !["C#", ".NET", "REST APIs"].includes(r.asked) && !["C#", ".NET"].includes(r.have);
    if (same(r.asked, skill) && has(r.have)) out.push({ skill, via: r.have, credit: r.credit, why: r.why });
    else if (reversible && same(r.have, skill) && has(r.asked)) out.push({ skill, via: r.asked, credit: r.credit, why: r.why });
  }
  for (const fam of SKILL_FAMILIES) {
    if (!fam.skills.some((s) => same(s, skill))) continue;
    for (const via of fam.skills) {
      if (same(via, skill) || !has(via) || out.some((t) => same(t.via, via))) continue;
      out.push({ skill, via, credit: fam.credit, why: `${via} and ${skill} fill the same role (${fam.id}). The ideas carry over; the product is different.` });
    }
  }
  return out;
}
