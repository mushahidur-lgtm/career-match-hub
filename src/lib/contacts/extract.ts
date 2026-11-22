import { newId } from "@/lib/ids";
import { todayLocal } from "@/lib/applications";
import { jobKey } from "@/lib/backup";
import type { Contact } from "@/types/contacts";
import type { Job } from "@/types/job";
import { normalizeCompany } from "@/lib/dedupe";
import { extractSkills, flattenSkills } from "@/lib/skills";
import { classifyType, emailBelongsTo, isSeniorHr, newContact, newSource, relevanceFor, scoreEvidence } from "./model";

/**
 * Names a posting states for itself, such as "Recruiter: Jane Smith". This is the strongest evidence there is, because the
 * employer wrote it next to the job. It reads only the posting's own text. Nothing is searched and nothing is guessed:
 * a name is taken only when it follows a label or sits next to a recruiting title.
 */

const ci = (s: string) => s.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`);
const NAME = "[A-Z][a-zÀ-ÿ'’-]{1,20}(?: [A-Z][a-zÀ-ÿ'’-]{1,20}){1,2}";
const ROLE = ci("(?:(?:Senior|Sr\\.?|Lead|Principal|Technical|IT|Corporate) )?(?:Talent Acquisition(?: Partner| Specialist| Advisor| Manager| Lead| Consultant)?|Recruiter|Recruitment (?:Partner|Consultant|Specialist|Manager)|Sourcer|HR (?:Business Partner|Manager|Generalist|Advisor)|Human Resources(?: Manager| Business Partner| Generalist| Advisor)?|People (?:Partner|Operations Partner)|Hiring Manager)");

const ROLE_ONLY = `(?:${ROLE})(?!\\s+(?:[Tt]eam|[Dd]ept|[Dd]epartment|[Gg]roup|[Oo]ffice|[Ss]ervices))`;

/** Words that make a name a business, a department or a topic, never a person. */
const BUSINESS_WORDS = new Set(["data", "engineering", "platform", "analytics", "services", "solutions", "group", "office", "region", "division", "systems", "software", "technology", "technologies", "digital", "cloud", "security", "operations", "finance", "marketing", "sales", "product", "design", "development", "infrastructure", "consulting", "partners", "global", "international", "corporate", "inc", "ltd", "corp", "llc", "limited", "company", "labs", "network", "networks", "intelligence", "science", "quality", "support", "delivery", "business", "management", "centre", "center", "canada", "ontario", "quebec", "ottawa", "toronto", "remote", "hybrid"]);

const NOT_NAMES = new Set(["human", "talent", "our", "the", "apply", "email", "phone", "team", "hiring", "recruiting", "recruitment", "hr", "people", "contact", "please", "resume", "send", "careers", "jobs", "reach", "visit", "this", "that", "department", "company", "manager", "director", "canada", "ottawa", "toronto", "ontario", "equal", "opportunity"]);

const looksLikeName = (n: string, company = "") => {
  const parts = n.split(" ");
  if (parts.length < 2 || parts.length > 3) return false;
  const words = parts.map((p) => p.toLowerCase().replace(/[.,]/g, ""));
  if (words.some((w) => NOT_NAMES.has(w) || BUSINESS_WORDS.has(w))) return false;
  // The employer's own name, or a piece of it, is not a person.
  const co = normalizeCompany(company);
  if (co && (normalizeCompany(n) === co || co.split(" ").some((w) => w.length > 2 && words.includes(w)))) return false;
  // A technology or skill is not a person ("Power Platform", "Azure Data").
  if (flattenSkills(extractSkills(n)).length > 0) return false;
  return true;
};

interface Hit {
  name: string;
  title: string;
  line: string;
}

/** The sentence or line around a match, as the evidence. */
function around(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf("\n", index) + 1, index - 120);
  const endLine = text.indexOf("\n", index + length);
  const end = Math.min(endLine === -1 ? text.length : endLine, index + length + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300);
}

export function findNamesInPosting(description: string, company = ""): Hit[] {
  const hits: Hit[] = [];
  const add = (name: string, title: string, index: number, length: number) => {
    if (!looksLikeName(name, company)) return;
    if (hits.some((h) => h.name.toLowerCase() === name.toLowerCase())) return;
    hits.push({ name, title: title.trim(), line: around(description, index, length) });
  };

  // "Recruiter: Jane Smith", "Hiring Manager - Jane Smith"
  for (const m of description.matchAll(new RegExp(`(${ROLE_ONLY}|Contact(?: person)?)\\s*[:\\-–—]\\s*(${NAME})`, "g"))) {
    add(m[2], /^contact/i.test(m[1]) ? "" : m[1], m.index ?? 0, m[0].length);
  }
  // "Jane Smith, Senior Recruiter" or "Jane Smith (Talent Acquisition Partner)"
  for (const m of description.matchAll(new RegExp(`(${NAME})\\s*(?:,|\\(|–|—|-)\\s*(${ROLE_ONLY})`, "g"))) {
    add(m[1], m[2], m.index ?? 0, m[0].length);
  }
  // "Contact Jane Smith, Talent Acquisition" — only with a role named right after
  for (const m of description.matchAll(new RegExp(`[Cc]ontact (${NAME})\\s*(?:,|\\(|at|from| in| of)?\\s*(?:our |the )?(${ROLE_ONLY})`, "g"))) {
    add(m[1], m[2], m.index ?? 0, m[0].length);
  }
  return hits;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

/**
 * Contacts the posting itself names. A name with a recruiting title is "Verified" (the employer tied them to this job);
 * a name next to only a generic "Contact:" label is "Possible". An email is kept only if it sits in the same line as the name.
 */
export function contactsFromPosting(job: Job, now = new Date()): Contact[] {
  const key = jobKey(job);
  return findNamesInPosting(job.description, job.company).flatMap((h) => {
    const score = scoreEvidence({
      nameInSource: true,
      companyInSource: true,
      roleInSource: Boolean(h.title),
      jobSpecific: true,
      companyDomain: false,
      linkedinConfirms: false,
      distinctSources: 1,
      senior: isSeniorHr(h.title),
    });
    if (!score) return [];
    const type = h.title ? classifyType(h.title) : "Other";
    const found = EMAIL.exec(h.line)?.[0] ?? null;
    const email = found && emailBelongsTo(h.name, found) ? found : null;
    return [
      newContact(
        {
          id: newId(),
          name: h.name,
          title: h.title,
          company: job.company,
          type,
          businessEmail: email,
          status: score.status,
          confidence: score.confidence,
          lastVerifiedAt: todayLocal(now),
          sources: [newSource({ url: job.applyUrl ?? `posting:${job.id}`, type: "job posting", evidence: h.line, now })],
          jobs: [
            {
              jobKey: key,
              jobTitle: job.title,
              company: job.company,
              location: job.location,
              relationship: type,
              relevance: relevanceFor({ type, title: h.title, department: "", jobTitle: job.title, jobSpecific: true, senior: isSeniorHr(h.title) }),
            },
          ],
          origin: "found",
        },
        now,
      ),
    ];
  });
}
