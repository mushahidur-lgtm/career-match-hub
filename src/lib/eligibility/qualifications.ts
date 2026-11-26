import { sectionedLines } from "@/lib/matching/requirements";
import type { CertificationDetail, EducationEntry, EligibilityCheck } from "@/types/job";

/**
 * Degrees, designations and certificates. A technology on the profile is never read as a certificate in it.
 * "Not eligible" needs three things: the posting says it is required with no alternative, the candidate has
 * said their list of qualifications is complete, and the list does not include it.
 */
export interface Qualifications {
  education: EducationEntry[];
  certifications: CertificationDetail[];
  yearsOfExperience: number | null;
  /** The candidate states that what they entered is everything they hold. */
  complete: boolean;
}

export interface Requirement {
  kind: "education" | "certification";
  /** A short name for what is asked, for display. */
  name: string;
  /** Degree level for education; canonical keys for certificates. */
  level: number;
  keys: string[];
  field: string | null;
  preferred: boolean;
  /** The posting uses words such as "required" or "must". A bare bullet in a requirements list is not enough. */
  explicit: boolean;
  equivalentExperience: boolean;
  obtainable: boolean;
  evidence: string;
}

/* ---------- reading levels and certificate names ---------- */

const LEVELS: [number, RegExp, string][] = [
  [5, /\b(?:ph\.?\s?d|doctorate|doctoral)\b/i, "Doctorate"],
  [4, /\b(?:master'?s?(?: of| degree)?|m\.?sc\.?|m\.?eng\.?|mba)(?![a-z])/i, "Master's degree"],
  [3, /\b(?:bachelor'?s?|b\.?sc\.?|b\.?eng\.?|b\.?com\.?|undergraduate degree|university degree)(?![a-z])/i, "Bachelor's degree"],
  [2, /\b(?:college diploma|diploma|associate'?s? degree)\b/i, "Diploma"],
];

export function degreeLevel(text: string): number {
  return LEVELS.find(([, pattern]) => pattern.test(text))?.[0] ?? 0;
}

const CERTIFICATES: [string, RegExp][] = [
  ["az-900", /\bAZ-?900\b|\bAzure Fundamentals\b/i],
  ["az-104", /\bAZ-?104\b|\bAzure Administrator Associate\b/i],
  ["az-204", /\bAZ-?204\b|\bAzure Developer Associate\b/i],
  ["az-305", /\bAZ-?305\b|\bAzure Solutions Architect Expert\b/i],
  ["az-400", /\bAZ-?400\b|\bDevOps Engineer Expert\b/i],
  ["dp-203", /\bDP-?203\b|\bAzure Data Engineer Associate\b/i],
  ["dp-600", /\bDP-?600\b|\bFabric Analytics Engineer Associate\b/i],
  ["dp-700", /\bDP-?700\b|\bFabric Data Engineer Associate\b/i],
  ["dp-900", /\bDP-?900\b|\bAzure Data Fundamentals\b/i],
  ["ai-102", /\bAI-?102\b|\bAzure AI Engineer Associate\b/i],
  ["pl-200", /\bPL-?200\b|\bPower Platform Functional Consultant\b/i],
  ["pl-300", /\bPL-?300\b|\bPower BI Data Analyst Associate\b/i],
  ["pl-400", /\bPL-?400\b|\bPower Platform Developer Associate\b/i],
  ["pl-600", /\bPL-?600\b|\bPower Platform Solution Architect\b/i],
  ["aws-developer", /\bAWS Certified Developer\b/i],
  ["aws-architect", /\bAWS Certified Solutions Architect\b/i],
  ["aws-data", /\bAWS Certified Data (?:Engineer|Analytics)\b/i],
  ["pmp", /\bPMP\b|\bProject Management Professional\b/i],
  ["cissp", /\bCISSP\b/i],
  ["itil", /\bITIL\b/i],
  ["csm", /\b(?:CSM|Certified Scrum ?Master)\b/i],
  ["cpa", /\bCPA\b/],
  ["peng", /\bP\.? ?Eng\.?(?![a-z])/],
];

export const certificateKeys = (text: string): string[] => CERTIFICATES.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);

/* ---------- reading the posting ---------- */

const PREFERRED = /\b(?:preferred|preference|an asset|assets?\b|nice to have|(?:is|would be) (?:a )?(?:plus|bonus|beneficial|desirable)|desirable|advantage(?:ous)?)\b/i;
const EXPLICIT = /\b(?:required|requires?|must|mandatory|essential|minimum|necessary)\b/i;
const NOT_REQUIRED = /\bno\b[^.]{0,30}\b(?:degree|certification)\b|\bnot (?:required|necessary)\b/i;
const EQUIVALENT = /\bor (?:an? )?(?:equivalent|comparable|relevant)\b[^.]{0,40}\bexperience\b|\bequivalent (?:combination|professional experience|work experience|experience)\b|\bin lieu of\b/i;
const OBTAINABLE = /\b(?:obtain|acquire|achieve|complete|earn)\w*\b[^.]{0,50}\b(?:within|after|upon|following)\b|\bwilling(?:ness)? to (?:obtain|pursue|achieve)|\bwithin \d+ (?:months?|days?) of (?:hire|hiring|start)/i;
const CERT_WORD = /\b(?:certification|certificate|certified|designation|accreditation|licen[sc]e)\b/i;
const FIELD = /\b(?:degree|diploma|bachelor'?s?|master'?s?|b\.?sc\.?|m\.?sc\.?)\b[^.]{0,20}?\b(?:in|of)\s+([A-Z][A-Za-z ]{2,50}?)(?=\s*(?:,|\.|;|\bor\b|\bis\b|\brequired\b|\bpreferred\b|$))/;

export function qualificationRequirements(description: string): Requirement[] {
  const out: Requirement[] = [];
  const seen = new Set<string>();
  const add = (r: Requirement) => {
    const key = `${r.kind}:${r.keys.join("+") || r.level || r.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  };

  for (const { line, preferred: inPreferred } of sectionedLines(description)) {
    for (const sentence of line.split(/(?<=[.;])\s+(?=[A-Z])/)) {
      if (NOT_REQUIRED.test(sentence)) continue;
      const base = {
        preferred: inPreferred || PREFERRED.test(sentence),
        explicit: EXPLICIT.test(sentence),
        equivalentExperience: EQUIVALENT.test(sentence),
        obtainable: OBTAINABLE.test(sentence),
        evidence: sentence.trim().slice(0, 300),
      };
      // "Bachelor's or Master's" asks for the lower of the two.
      const levels = LEVELS.filter(([, p]) => p.test(sentence));
      if (levels.length && /\bdegree|diploma|bachelor|master|doctor|ph\.?d|b\.?sc|m\.?sc/i.test(sentence)) {
        const [level, , name] = levels[levels.length - 1];
        add({ ...base, kind: "education", name, level, keys: [], field: sentence.match(FIELD)?.[1]?.trim() ?? null });
      }
      const keys = certificateKeys(sentence);
      if (keys.length) add({ ...base, kind: "certification", name: keys.map((k) => k.toUpperCase()).join(" or "), level: 0, keys, field: null });
      else if (CERT_WORD.test(sentence) && /\b(?:certification|certificate|designation|licen[sc]e)s?\b/i.test(sentence)) {
        add({ ...base, kind: "certification", name: "a certification", level: 0, keys: [], field: null });
      }
    }
  }
  return out;
}

/* ---------- comparing with the candidate ---------- */

const RELATED_FIELDS = /comput|software|information|engineering|mathematic|statistic|data|technology|\bit\b|science/i;
/** Years that can reasonably stand in for a degree when the posting asks for "equivalent experience" and names none. */
const EQUIVALENT_YEARS = 4;

const heldNames = (c: CertificationDetail[]) => c.filter((x) => !/\b(?:in progress|expected|studying|pursuing)\b/i.test(x.name));
const expired = (c: CertificationDetail, now: Date) => {
  if (!c.expires) return false;
  const end = Date.parse(c.expires.length === 7 ? `${c.expires}-28` : c.expires.length === 4 ? `${c.expires}-12-31` : c.expires);
  return Number.isFinite(end) && end < now.getTime();
};

export function checkQualifications(description: string, mine: Qualifications, now = new Date()): EligibilityCheck[] {
  return qualificationRequirements(description).map((r): EligibilityCheck => {
    const make = (status: EligibilityCheck["status"], note: string, candidateEvidence: string | null, advisory = false): EligibilityCheck => ({
      gate: r.kind,
      status,
      postingEvidence: r.evidence,
      candidateEvidence,
      note,
      ...(advisory ? { advisory: true } : {}),
    });
    /** Asked for but not shown: a preference is only noted, a requirement is verified or, if the list is complete, failed. */
    const unmet = (what: string, stated: string | null) => {
      if (r.preferred) return make("preferred_missing", `Preferred, not required: ${what}.`, stated);
      if (r.obtainable) return make("eligible", `You do not show ${what}. The posting lets you obtain it after hiring.`, stated);
      if (mine.complete && r.explicit) return make("not_eligible", `The posting requires ${what}, and your complete list does not include it.`, stated);
      return make("needs_verification", `The posting asks for ${what}, which your details do not show. Check before applying.`, stated, !r.explicit);
    };

    if (r.kind === "education") {
      const what = r.field ? `a ${r.name} in ${r.field}` : `a ${r.name}`;
      const stated = mine.education.length ? `You entered: ${mine.education.map((e) => (e.field ? `${e.credential} (${e.field})` : e.credential)).join("; ")}` : null;
      const best = mine.education.filter((e) => degreeLevel(e.credential) >= r.level);
      const fieldOk = (e: EducationEntry) =>
        !r.field || `${e.credential} ${e.field ?? ""}`.toLowerCase().includes(r.field.toLowerCase()) || (/\brelated\b/i.test(r.evidence) && RELATED_FIELDS.test(`${e.credential} ${e.field ?? ""}`));
      if (best.some(fieldOk)) return make(r.preferred ? "eligible" : "eligible", `Your education meets ${what}.`, stated);
      if (r.equivalentExperience && !r.preferred) {
        return (mine.yearsOfExperience ?? 0) >= EQUIVALENT_YEARS
          ? make("eligible", `The posting accepts equivalent experience, and you have ${mine.yearsOfExperience} years. Be ready to make that case.`, stated)
          : make("needs_verification", `The posting accepts equivalent experience instead of ${what}. Check whether yours counts.`, stated, true);
      }
      if (best.length && !r.preferred) return make("needs_verification", `You hold the level asked, but the field may differ from ${r.field}.`, stated, true);
      return unmet(what, stated);
    }

    const held = heldNames(mine.certifications);
    const stated = mine.certifications.length ? `You entered: ${mine.certifications.map((c) => c.name).join("; ")}` : null;
    if (!r.keys.length) {
      // A certificate the posting does not name clearly can only be checked by a person.
      return r.preferred
        ? make("preferred_missing", "The posting mentions a certification as an asset.", stated)
        : make("needs_verification", "The posting asks for a certification this app could not identify. Read the line and check.", stated, !r.explicit);
    }
    const what = `${r.name} certification`;
    const matching = held.filter((c) => certificateKeys(c.name).some((k) => r.keys.includes(k)));
    if (matching.some((c) => !expired(c, now))) return make("eligible", `You hold ${what}.`, stated);
    if (matching.length) {
      return r.preferred
        ? make("preferred_missing", `Your ${what} has expired.`, stated)
        : make("needs_verification", `Your ${what} expired (${matching[0].expires}). Renew it or ask whether it still counts.`, stated);
    }
    return unmet(what, stated);
  });
}
