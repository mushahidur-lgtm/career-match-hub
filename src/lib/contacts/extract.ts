import { newId } from "@/lib/ids";
import { todayLocal } from "@/lib/applications";
import { jobKey } from "@/lib/backup";
import type { Contact, ContactType } from "@/types/contacts";
import type { Job } from "@/types/job";
import { normalizeCompany } from "@/lib/dedupe";
import { extractSkills, flattenSkills } from "@/lib/skills";
import { classifyType, emailBelongsTo, isSeniorHr, newContact, newSource, relevanceFor, scoreEvidence } from "./model";

/**
 * Names a posting states for itself, such as "Recruiter: Jane Smith". This is the strongest evidence there is, because the
 * employer wrote it next to the job. It reads only the posting's own text. Nothing is searched and nothing is guessed:
 * a name is taken only when it follows a label or sits next to a recruiting title, and an email or phone number is taken
 * only when it is printed on the same line, close to that name. No name, address or profile link is ever built.
 */

const ci = (s: string) => s.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`);
const NAME_BODY = "(?:Mc|Mac|O['’]|D['’])?[A-Z][a-zÀ-ÿ'’-]{1,20}";
const NAME = `(?:(?:Dr|Mr|Ms|Mrs|Mx)\\.? )?${NAME_BODY}(?: (?:[A-Z]\\.? )?${NAME_BODY}){1,2}`;
const ROLE = ci(
  "(?:(?:Senior|Sr\\.?|Lead|Principal|Technical|IT|Corporate|Campus|University|Executive) )?(?:Talent Acquisition(?: Partner| Specialist| Advisor| Manager| Lead| Consultant| Coordinator)?|Talent Partner|Recruiter|Recruiting(?: Manager| Coordinator| Lead| Partner| Specialist)?|Recruitment (?:Partner|Consultant|Specialist|Manager|Coordinator|Lead)|Sourcer|Staffing (?:Specialist|Consultant|Partner)|HR (?:Business Partner|Manager|Generalist|Advisor|Coordinator|Partner|Lead|Representative)|Human Resources(?: Manager| Business Partner| Generalist| Advisor| Coordinator| Partner| Representative)?|People (?:Partner|Operations Partner|Business Partner)|People (?:&|and) Culture(?: Partner| Manager| Lead)?|Hiring (?:Manager|Lead|Contact))",
);
const ROLE_ONLY = `(?:${ROLE})(?!\\s+(?:[Tt]eam|[Dd]ept|[Dd]epartment|[Gg]roup|[Oo]ffice|[Ss]ervices))`;

/** A department leader's title, such as "Director of Data Engineering". Chief officers are left out: they are not hiring for one posting. */
const DEPT = "(?:(?:Senior |Associate |Assistant )?(?:Director|Head|Vice President|VP|Manager)|Team Lead)(?: of| ,|,)? ?(?:[A-Z][A-Za-z&/'’-]*)(?: (?:and |& )?[A-Z][A-Za-z&/'’-]*){0,3}";

const LEAD_IN = "(?:[Cc]ontact|[Rr]each out to|[Ee]mail|[Cc]all|[Ss]peak (?:with|to)|[Tt]alk to|[Ss]end (?:your )?(?:resume|CV|application)s? to|[Dd]irect (?:questions|inquiries|enquiries) to)";

/** Words that make a name a business, a department or a topic, never a person. */
const BUSINESS_WORDS = new Set(["data", "engineering", "platform", "analytics", "services", "solutions", "group", "office", "region", "division", "systems", "software", "technology", "technologies", "digital", "cloud", "security", "operations", "finance", "marketing", "sales", "product", "design", "development", "infrastructure", "consulting", "partners", "global", "international", "corporate", "inc", "ltd", "corp", "llc", "limited", "company", "labs", "network", "networks", "intelligence", "science", "quality", "support", "delivery", "business", "management", "centre", "center", "canada", "ontario", "quebec", "ottawa", "toronto", "remote", "hybrid"]);

/** Headings, job titles and everyday words that start with a capital in a posting but are not part of a person's name. */
const NOT_NAMES = new Set([
  "human", "talent", "our", "the", "apply", "email", "phone", "team", "hiring", "recruiting", "recruitment", "hr", "people", "contact", "please", "resume", "send", "careers", "jobs", "reach", "visit", "this", "that", "department", "company", "manager", "director", "canada", "ottawa", "toronto", "ontario", "equal", "opportunity",
  "analyst", "engineer", "developer", "specialist", "coordinator", "consultant", "associate", "assistant", "officer", "administrator", "architect", "lead", "senior", "junior", "principal", "intern", "supervisor", "advisor", "representative", "technician", "scientist",
  "full", "part", "time", "job", "description", "responsibilities", "requirements", "qualifications", "about", "summary", "overview", "benefits", "position", "role", "experience", "skills", "why", "join", "who", "what", "how", "working", "work", "location", "salary", "pay", "compensation", "employment", "application", "applications", "process", "accommodation", "accommodations", "accessibility", "diversity", "inclusion", "values", "culture", "mission", "vision", "privacy", "policy", "statement", "notice", "note", "important", "disclaimer", "closing", "date", "deadline", "reference", "number", "posting", "competition", "opening",
]);

/** Words in front of a name ("Please Contact Jane Smith") that the pattern can sweep up by mistake. */
const LEADING = new Set(["contact", "email", "call", "reach", "please", "speak", "talk", "hello", "hi", "dear", "thanks", "regards", "sincerely", "attn", "attention", "from", "by", "to", "our", "with", "and"]);

const HONORIFIC = /^(?:Dr|Mr|Ms|Mrs|Mx)\.?\s+/;

/** Removes titles and stray leading words, leaving what could be a name. */
function cleanName(raw: string): string {
  let words = raw.replace(HONORIFIC, "").split(" ");
  while (words.length && LEADING.has(words[0].toLowerCase().replace(/[.,]/g, ""))) words = words.slice(1);
  return words.join(" ");
}

const isInitial = (w: string) => /^[A-Z]\.?$/.test(w);

const looksLikeName = (n: string, company = "") => {
  const parts = n.split(" ").filter(Boolean);
  const real = parts.filter((p) => !isInitial(p));
  if (real.length < 2 || real.length > 3 || parts.length > 4) return false;
  const words = parts.map((p) => p.toLowerCase().replace(/[.,]/g, ""));
  if (words.some((w) => NOT_NAMES.has(w) || BUSINESS_WORDS.has(w))) return false;
  // The employer's own name, or a piece of it, is not a person.
  const co = normalizeCompany(company);
  if (co && (normalizeCompany(n) === co || co.split(" ").some((w) => w.length > 2 && words.includes(w)))) return false;
  // A technology or skill is not a person ("Power Platform", "Azure Data").
  if (flattenSkills(extractSkills(n)).length > 0) return false;
  return true;
};

export type HitKind = "recruiting" | "hiring" | "reports" | "department" | "generic";

export interface Hit {
  name: string;
  title: string;
  line: string;
  kind: HitKind;
  /** Set when the posting gives a more exact type than the title does. */
  type?: ContactType;
  /** Printed on the same line, close to the name. Never built from the name. */
  email: string | null;
  phone: string | null;
  cautions: string[];
}

interface Raw extends Hit {
  index: number;
  end: number;
  lineStart: number;
}

/** The sentence or line around a match, as the evidence. */
function around(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf("\n", index) + 1, index - 120);
  const endLine = text.indexOf("\n", index + length);
  const end = Math.min(endLine === -1 ? text.length : endLine, index + length + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300);
}

const EMAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_G = /(?<![\d-])(?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)\s?|[2-9]\d{2}[\s.-])[2-9]\d{2}[\s.-]\d{4}(?:\s?(?:ext\.?|x|extension)\s?\d{1,5})?(?![\d-])/gi;
/** A person's own mailbox is not a business address, so these are never taken. */
const FREE_MAIL = /@(?:gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail)\./i;
/** The farthest an email or phone can be from the name and still count as theirs, on one line. */
const NEAR = 220;

export interface PostingAnalysis {
  hits: Hit[];
  /** Addresses and numbers the posting prints that are not next to any named person, such as a shared careers mailbox. */
  shared: { emails: string[]; phones: string[] };
}

/** Reads a posting for named people, and for the public business email and phone printed beside them. */
export function analyzePosting(description: string, company = ""): PostingAnalysis {
  const raw: Raw[] = [];
  const add = (nameRaw: string, title: string, kind: HitKind, index: number, length: number, extra: { type?: ContactType; cautions?: string[] } = {}) => {
    const name = cleanName(nameRaw);
    if (!looksLikeName(name, company)) return;
    if (raw.some((h) => h.name.toLowerCase() === name.toLowerCase())) return;
    const lineStart = description.lastIndexOf("\n", index) + 1;
    raw.push({ name, title: title.trim(), line: around(description, index, length), kind, type: extra.type, email: null, phone: null, cautions: extra.cautions ?? [], index, end: index + length, lineStart });
  };

  // "Recruiter: Jane Smith", "Hiring Manager - Jane Smith", "Contact: Jane Smith"
  for (const m of description.matchAll(new RegExp(`(${ROLE_ONLY}|Contact(?: person| name)?|Recruiter name)\\s*[:\\-–—|]\\s*(${NAME})`, "g"))) {
    const label = m[1];
    add(m[2], /^(?:contact|recruiter name)/i.test(label) ? "" : label, /^contact/i.test(label) ? "generic" : /hiring/i.test(label) ? "hiring" : "recruiting", m.index ?? 0, m[0].length);
  }
  // "Jane Smith, Senior Recruiter" or "Jane Smith (Talent Acquisition Partner)"
  for (const m of description.matchAll(new RegExp(`(${NAME})\\s*(?:,|\\(|–|—|-)\\s*(${ROLE_ONLY})`, "g"))) {
    add(m[1], m[2], /hiring/i.test(m[2]) ? "hiring" : "recruiting", m.index ?? 0, m[0].length);
  }
  // "Contact Jane Smith, Talent Acquisition", "Email Jane Smith at Acme, Recruiter" — only with a role named right after
  for (const m of description.matchAll(new RegExp(`${LEAD_IN} (${NAME})\\s*(?:,|\\(|at|from| in| of|-|–)?\\s*(?:our |the |a )?(${ROLE_ONLY})`, "g"))) {
    add(m[1], m[2], /hiring/i.test(m[2]) ? "hiring" : "recruiting", m.index ?? 0, m[0].length);
  }
  // "Reports to: Jane Smith, Director of Engineering". The person the role reports to is the likely hiring manager.
  for (const m of description.matchAll(new RegExp(`(?:[Rr]eports? to|[Rr]eporting to)\\s*[:\\-–—]?\\s*(${NAME})(?:\\s*(?:,|\\(|–|—|-)\\s*(${DEPT}))?`, "g"))) {
    add(m[1], m[2] ?? "", "reports", m.index ?? 0, m[0].length, { type: "Hiring Manager", cautions: ["Named in the posting as the person this role reports to."] });
  }
  // "Jane Smith, Director of Data Engineering": a department leader, named but not tied to this one posting.
  for (const m of description.matchAll(new RegExp(`(${NAME})\\s*(?:,|\\(|–|—|-)\\s*(${DEPT})`, "g"))) {
    add(m[1], m[2], "department", m.index ?? 0, m[0].length, { type: "Department Head" });
  }

  // Attach the email and phone printed closest to each name, on the same line, to that name only.
  const claim = (re: RegExp, set: (h: Raw, v: string) => void, ok: (v: string) => boolean) => {
    const best = new Map<Raw, number>();
    const taken = new Set<string>();
    for (const m of description.matchAll(re)) {
      const value = m[0].replace(/[.,;:]+$/, "");
      if (!ok(value)) continue;
      const pos = m.index ?? 0;
      // Contact details are printed after the name ("Jane Smith, jane@x.example, 613-555-0142"), so a detail belongs to the
      // nearest name before it on the line. Only a detail with no name before it can belong to the name that follows.
      const sameLine = raw.filter((h) => description.lastIndexOf("\n", pos) + 1 === h.lineStart);
      const before = sameLine.filter((h) => h.end <= pos).sort((a, b) => b.end - a.end)[0];
      const after = sameLine.filter((h) => h.index >= pos + value.length).sort((a, b) => a.index - b.index)[0];
      const owner = before && pos - before.end <= NEAR ? before : after && after.index - (pos + value.length) <= NEAR ? after : null;
      if (!owner) continue;
      const distance = owner === before ? pos - owner.end : owner.index - (pos + value.length);
      if (distance < (best.get(owner) ?? Infinity)) {
        best.set(owner, distance);
        set(owner, value);
        taken.add(value);
      }
    }
    return taken;
  };
  const emailsOk = (v: string) => !FREE_MAIL.test(v);
  const claimedEmails = claim(EMAIL_G, (h, v) => (h.email = v), emailsOk);
  const claimedPhones = claim(PHONE_G, (h, v) => (h.phone = v.trim()), () => true);
  for (const h of raw) {
    if (h.email && !emailBelongsTo(h.name, h.email)) h.cautions.push("The email is printed next to the name in the posting. It may be a shared mailbox, not this person's own.");
  }

  const unique = (re: RegExp, claimed: Set<string>, ok: (v: string) => boolean) => [...new Set([...description.matchAll(re)].map((m) => m[0].replace(/[.,;:]+$/, "").trim()))].filter((v) => !claimed.has(v) && ok(v)).slice(0, 3);
  const hits: Hit[] = raw.map((h) => ({ name: h.name, title: h.title, line: h.line, kind: h.kind, type: h.type, email: h.email, phone: h.phone, cautions: h.cautions }));
  return { hits, shared: { emails: unique(EMAIL_G, claimedEmails, emailsOk), phones: unique(PHONE_G, claimedPhones, () => true) } };
}

export const findNamesInPosting = (description: string, company = ""): Hit[] => analyzePosting(description, company).hits;

/**
 * Contacts the posting itself names. A name with a recruiting title is "Verified" (the employer tied them to this job);
 * a name next to only a generic "Contact:" label is "Possible"; a department leader or a "reports to" name is at most "Likely".
 */
export function contactsFromPosting(job: Job, now = new Date()): Contact[] {
  const key = jobKey(job);
  return findNamesInPosting(job.description, job.company).flatMap((h) => {
    const tied = h.kind === "recruiting" || h.kind === "hiring" || h.kind === "generic";
    const score = scoreEvidence({
      nameInSource: true,
      companyInSource: true,
      roleInSource: Boolean(h.title) || h.kind === "reports",
      jobSpecific: tied,
      companyDomain: false,
      linkedinConfirms: false,
      distinctSources: 1,
      senior: isSeniorHr(h.title),
    });
    if (!score) return [];
    const type = h.type ?? (h.title ? classifyType(h.title) : "Other");
    return [
      newContact(
        {
          id: newId(),
          name: h.name,
          title: h.title,
          company: job.company,
          type,
          businessEmail: h.email,
          businessPhone: h.phone,
          status: score.status,
          confidence: score.confidence,
          lastVerifiedAt: todayLocal(now),
          cautions: h.cautions,
          sources: [newSource({ url: job.applyUrl ?? `posting:${job.id}`, type: "job posting", evidence: h.line, now })],
          jobs: [
            {
              jobKey: key,
              jobTitle: job.title,
              company: job.company,
              location: job.location,
              relationship: type,
              jobSpecific: h.kind !== "department",
              relevance: relevanceFor({ type, title: h.title, department: "", jobTitle: job.title, jobSpecific: h.kind !== "department", senior: isSeniorHr(h.title) }),
            },
          ],
          origin: "found",
        },
        now,
      ),
    ];
  });
}
