import type { ClearanceLevel } from "@/types/job";

/** An eligibility condition the posting states as a requirement, with its own words. */
export type Statement =
  | { gate: "citizenship"; allows: ("citizen" | "permanent_resident")[]; country: "ca" | "other"; evidence: string }
  | { gate: "work_authorization"; country: "ca" | "other"; evidence: string }
  | { gate: "sponsorship"; evidence: string }
  | { gate: "clearance"; level: Exclude<ClearanceLevel, "none"> | null; obtainable: boolean; evidence: string }
  | { gate: "language"; language: string; bar: "fluent" | "professional" | "unstated"; evidence: string };

const sentences = (text: string) =>
  text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z•(-])|•/)
    .map((s) => s.replace(/^[-*–·]\s*/, "").trim())
    .filter(Boolean);

/** Wording that makes something a wish, not a condition. */
const PREFERENCE = /\b(?:prefer(?:red|ence|ably)?|priority (?:will be |may be )?(?:given|to)|an asset|assets?\b|nice to have|(?:is|would be) (?:a )?(?:plus|bonus|beneficial|desirable)|desirable|advantage(?:ous)?|encouraged)\b/i;
const NOT_REQUIRED = /\b(?:no|not)\b[^.]{0,40}\b(?:required|necessary|needed|mandatory)\b|\bnot (?:a )?requirement\b/i;

const OTHER_COUNTRY = /\b(?:u\.?s\.?a?\.?|united states|american|uk|united kingdom|british|european|eu|australian)(?![a-z])/i;

const CITIZEN_OR_PR = /\bcitizens?(?:hip)?\b[^.]{0,30}(?:\bor\b|\band\/or\b|\/)\s*(?:a )?permanent residen(?:t|ts|cy)\b|\bpermanent residen(?:t|ts|cy)\b[^.]{0,30}(?:\bor\b|\band\/or\b|\/)\s*(?:a )?(?:canadian )?citizen|\bpermanent residen(?:t|cy) (?:status )?(?:is )?(?:required|mandatory)/i;
const CITIZEN_ONLY = /\b(?:must (?:be|hold)|requires?|required to be|only|restricted to|open (?:only )?to|limited to)\b[^.]{0,40}\bcitizens?(?:hip)?\b|\bcitizenship (?:is )?(?:required|mandatory|a requirement)\b|\bcitizens? only\b/i;
const WORK_AUTH = /\b(?:legally (?:eligible|entitled|authori[sz]ed|permitted|able)|authori[sz]ed|eligible|entitled|right|legal authori[sz]ation|permitted) to work (?:in|within) (?:canada|the (?:us|u\.s\.|united states|uk))|\bwork authori[sz]ation (?:in \w+ )?(?:is )?required\b/i;
const NO_SPONSOR = /\bno (?:visa |work permit |immigration )?sponsorship\b|\b(?:unable|not able|cannot|can't|do(?:es)? not|will not|won't|not in a position) (?:to )?(?:(?:provide|offer|support) )?(?:visa |work permit |immigration )?sponsor(?:ship|ing)?\b|\bsponsorship (?:is )?(?:not (?:available|offered|provided)|unavailable)\b/i;

const CLEARANCE = /\btop[- ]secret\b|\bsecret(?:[- ]level)? (?:security )?(?:clearance|level)\b|\bclearance\b[^.]{0,30}\bsecret\b|\bsecurity clearance\b|\breliability (?:status|clearance)\b/i;
const OBTAINABLE = /\b(?:able|ability|eligib\w+|willing(?:ness)?) to (?:obtain|acquire|get|attain|undergo)|\bobtain(?:able)?\b|\beligible for\b|\bwill be required to (?:obtain|undergo)\b/i;
const HOLD = /\b(?:must (?:currently )?(?:hold|have|possess)|active|current|existing|valid)\b/i;

const LANGUAGES = ["French", "English", "Spanish", "Mandarin", "Cantonese", "German", "Portuguese", "Arabic", "Hindi", "Japanese", "Italian", "Polish", "Russian", "Korean", "Dutch", "Punjabi"];
const LANGUAGE_CUE = /\b(?:fluen(?:t|cy)|bilingual(?:ism)?|proficien(?:t|cy)|native|must (?:be able to )?(?:speak|read|write|communicate)|required|requires?|essential|mandatory|imperative|command of|spoken and written|written and (?:spoken|oral|verbal))\b/i;

const named = (text: string) => LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`, "i").test(text));

export function detectEligibility(text: string): Statement[] {
  const out: Statement[] = [];
  const seen = new Set<string>();
  const add = (s: Statement) => {
    const key = s.gate === "language" ? `language:${s.language}` : s.gate;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  };

  for (const sentence of sentences(text)) {
    const evidence = sentence.slice(0, 300);
    const preference = PREFERENCE.test(sentence);

    // "No sponsorship" is itself a negative sentence, so it is read before the "not required" filter.
    if (NO_SPONSOR.test(sentence)) add({ gate: "sponsorship", evidence });

    // Preference wording often shares a sentence with a requirement ("English required, French an asset"),
    // so everything else is judged clause by clause.
    for (const clause of sentence.split(/;|\bbut\b|\bwhile\b|,(?=\s*(?:and\s+)?[A-Za-z]+(?:\s+[A-Za-z]+){0,2}\s+(?:is|would be|are)\b)/i)) {
      if (NOT_REQUIRED.test(clause) || PREFERENCE.test(clause) || !LANGUAGE_CUE.test(clause)) continue;
      const languages = named(clause);
      // "Bilingual" with no language named means English and French only when the sentence names none either.
      if (/\bbilingual(?:ism)?\b/i.test(clause) && !languages.length && !named(sentence).length) languages.push("English", "French");
      const bar = /\b(?:fluen|native|bilingual|imperative)/i.test(clause) ? ("fluent" as const) : /\bproficien/i.test(clause) ? ("professional" as const) : ("unstated" as const);
      for (const language of languages) add({ gate: "language", language, bar, evidence: clause.trim().slice(0, 300) });
    }

    if (NOT_REQUIRED.test(sentence) || preference) continue;
    const country = OTHER_COUNTRY.test(sentence) && !/\bcanad/i.test(sentence) ? ("other" as const) : ("ca" as const);
    if (CITIZEN_OR_PR.test(sentence)) add({ gate: "citizenship", allows: ["citizen", "permanent_resident"], country, evidence });
    else if (CITIZEN_ONLY.test(sentence)) add({ gate: "citizenship", allows: ["citizen"], country, evidence });
    if (WORK_AUTH.test(sentence)) add({ gate: "work_authorization", country, evidence });
    if (CLEARANCE.test(sentence)) {
      const level = /\btop[- ]secret\b/i.test(sentence) ? ("top_secret" as const) : /\bsecret\b/i.test(sentence) ? ("secret" as const) : /\breliability\b/i.test(sentence) ? ("reliability" as const) : null;
      // Only wording that asks for a clearance already held can rule someone out.
      add({ gate: "clearance", level, obtainable: OBTAINABLE.test(sentence) || !HOLD.test(sentence), evidence });
    }
  }
  return out;
}
