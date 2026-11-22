import { newId } from "@/lib/ids";
import { todayLocal } from "@/lib/applications";
import { normalizeCompany, normalizeTitle } from "@/lib/dedupe";
import { CONTACT_LIMITS as L, type Contact } from "@/types/contacts";
import { classifyType, isLinkedInProfile, isSeniorHr, newContact, newSource, normName, relevanceFor, scoreEvidence } from "./model";

/**
 * Decides what a web search actually proved. The model's own words are never evidence: a person is kept only when a
 * search result's title or a cited passage (text the search tool returned from a page) contains their name. Titles,
 * emails, phones and profile links are each kept only if a source shows them, and confidence and status come from fixed
 * rules in scoreEvidence, not from the model.
 */

export interface SearchResultInfo {
  url: string;
  title: string;
}

export interface Citation {
  url: string;
  /** The passage the search tool quoted from the page. Short, but it is real page text. */
  citedText: string;
}

export interface WebEvidence {
  results: SearchResultInfo[];
  citations: Citation[];
}

/** What the model claimed. Untrusted: each part is checked against the evidence. */
export interface RawCandidate {
  name: string;
  title?: string;
  company?: string;
  department?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  note?: string;
  sourceUrls: string[];
}

export interface JobContext {
  jobKey: string;
  jobTitle: string;
  company: string;
  applyUrl: string | null;
}

export interface Dropped {
  name: string;
  reason: string;
}

const urlKey = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const ROLE_PHRASE = /(?:(?:senior|sr\.?|lead|principal|technical|corporate|it) )?(?:talent acquisition(?: partner| specialist| advisor| manager| lead| consultant)?|recruiter|recruitment (?:partner|consultant|specialist|manager)|sourcer|hr (?:business partner|manager|generalist|advisor|director)|human resources(?: manager| business partner| generalist| advisor| director)?|people partner|hiring manager)/i;
const ROLE_WORDS = /recruit|talent acquisition|talent partner|human resources|\bhr\b|hiring manager|people (?:and|&) culture|sourcer/i;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for a person's name as it may appear in text: first and last name, with at most one word between. */
function nameRegex(name: string): RegExp | null {
  const parts = fold(name).replace(/\b(?:dr|mr|mrs|ms|mx|prof)\b\.?/gi, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return new RegExp(`\\b${esc(parts[0])}\\W+(?:[\\w'.-]+\\W+)?${esc(parts[parts.length - 1])}\\b`, "i");
}

const mentions = (pool: string, name: string) => nameRegex(name)?.test(fold(pool)) ?? false;

/** The first line of the pooled text (a result title, or one cited passage) that mentions the name. */
function lineWith(pool: string, name: string): string {
  const re = nameRegex(name);
  if (!re) return "";
  return fold(pool).split("\n").find((l) => re.test(l)) ?? "";
}

/**
 * The text near a name, within the one passage that mentions it, so a title or company that belongs to another
 * person in a neighbouring passage is not credited to them. Empty when the name is not there.
 */
function nearName(pool: string, name: string, radius = 140): string {
  const line = lineWith(pool, name);
  const m = line ? nameRegex(name)?.exec(line) : null;
  if (!line || !m) return "";
  return squash(line.slice(Math.max(0, m.index - radius), m.index + m[0].length + radius));
}

/** The recruiting role phrase closest to the name, so two people named in one passage each get their own. */
function roleNearest(pool: string, name: string): string | null {
  const line = lineWith(pool, name);
  const m = line ? nameRegex(name)?.exec(line) : null;
  if (!line || !m) return null;
  const centre = m.index + m[0].length / 2;
  let best: { text: string; dist: number } | null = null;
  for (const r of line.matchAll(new RegExp(ROLE_PHRASE.source, "gi"))) {
    const dist = Math.abs((r.index ?? 0) + r[0].length / 2 - centre);
    if (dist <= 140 && (!best || dist < best.dist)) best = { text: r[0], dist };
  }
  return best?.text ?? null;
}

const BAD_NAME = /\b(team|careers?|department|recruiting|recruitment|hr|human resources|talent acquisition|opportunit|hiring)\b/i;

export function verifyCandidates(raw: RawCandidate[], ev: WebEvidence, job: JobContext, now = new Date()): { contacts: Contact[]; dropped: Dropped[] } {
  const resultByUrl = new Map(ev.results.map((r) => [urlKey(r.url), r]));
  const poolByUrl = new Map<string, string>();
  for (const r of ev.results) poolByUrl.set(urlKey(r.url), r.title);
  for (const c of ev.citations) {
    const k = urlKey(c.url);
    poolByUrl.set(k, `${poolByUrl.get(k) ?? ""}\n${c.citedText}`);
  }

  const companyNorm = normalizeCompany(job.company);
  const companyKnown = Boolean(companyNorm) && !/^company not listed$/i.test(job.company.trim());
  const jobTitleNorm = normalizeTitle(job.jobTitle);
  const companyHostPart = companyNorm.split(" ")[0] ?? "";
  const applyKey = job.applyUrl ? urlKey(job.applyUrl) : null;

  const contacts: Contact[] = [];
  const dropped: Dropped[] = [];
  const seenNames = new Set<string>();

  for (const c of raw) {
    const name = squash(c.name ?? "");
    const reject = (reason: string) => dropped.push({ name: name || "(no name)", reason });
    if (!name || name.length > L.name || /\d/.test(name) || name.split(" ").length > 5 || BAD_NAME.test(name) || name.split(" ").length < 2) {
      reject("That is not a person's name.");
      continue;
    }
    if (seenNames.has(normName(name))) continue;

    // Only sources that really were search results count, whatever the model says.
    const urls = [...new Set((c.sourceUrls ?? []).map(urlKey))].filter((u) => resultByUrl.has(u));
    if (!urls.length) {
      reject("None of the sources it named were in the search results.");
      continue;
    }

    const supported = urls.map((u) => ({ u, pool: poolByUrl.get(u) ?? "", result: resultByUrl.get(u)! })).filter((x) => mentions(x.pool, name));
    if (!supported.length) {
      reject("No source text or result title contained this name.");
      continue;
    }

    const near = supported.map((s) => nearName(s.pool, name)).join(" ");
    const roleText = supported.map((x) => roleNearest(x.pool, name)).find(Boolean) ?? null;
    const roleInSource = Boolean(roleText) || ROLE_WORDS.test(near);
    const poolAll = supported.map((s) => s.pool).join("\n");
    const companyInSource = companyKnown && normalizeCompany(poolAll).includes(companyNorm);
    const jobSpecific = (jobTitleNorm.length > 4 && normalizeTitle(poolAll).includes(jobTitleNorm)) || supported.some((s) => applyKey !== null && s.u === applyKey);
    const hosts = new Set(supported.map((s) => hostOf(s.u)).filter(Boolean));
    const companyDomain = companyHostPart.length > 2 && [...hosts].some((h) => h.replace(/[^a-z0-9]/g, "").includes(companyHostPart.replace(/[^a-z0-9]/g, "")));

    // A title is kept only if a source says it. Otherwise the role words the source does show are used, or none.
    const claimedTitle = squash(c.title ?? "");
    const titleShown = claimedTitle && normName(near).includes(normName(claimedTitle)) ? claimedTitle : (roleText ?? "");
    const cautions: string[] = [];
    if (claimedTitle && !titleShown) cautions.push("The title suggested by the search was not confirmed by a source, so it is left out.");

    // A profile link counts only if it is literally a search result, and its result title shows this person.
    const li = c.linkedinUrl && isLinkedInProfile(c.linkedinUrl) && resultByUrl.has(urlKey(c.linkedinUrl)) ? c.linkedinUrl.trim() : null;
    const liResult = li ? resultByUrl.get(urlKey(li)) : null;
    const linkedinConfirms = Boolean(liResult && normName(liResult.title).includes(normName(name).split(" ")[0]) && normName(liResult.title).includes(normName(name).split(" ").slice(-1)[0]));
    const linkedinUrl = li && linkedinConfirms ? li : null;
    if (c.linkedinUrl && !linkedinUrl) cautions.push("A profile link was suggested, but it was not a search result that matched this person, so it is left out.");

    const senior = isSeniorHr(titleShown || claimedTitle);
    const score = scoreEvidence({ nameInSource: true, companyInSource, roleInSource, jobSpecific, companyDomain, linkedinConfirms, distinctSources: hosts.size, senior });
    if (!score) {
      reject("The sources do not tie this person to the company or to a recruiting role.");
      continue;
    }
    if (senior && !jobSpecific) cautions.push("A senior HR leader. Nothing found says they handle this posting.");
    if (!jobSpecific) cautions.push("No source names this job, so check that they cover this role.");

    // An email or phone is kept only if it appears word for word in a source about this person.
    const email = c.email && new RegExp(c.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(poolAll) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? c.email.trim() : null;
    const digits = (s: string) => s.replace(/\D/g, "");
    const phone = c.phone && digits(c.phone).length >= 10 && digits(poolAll).includes(digits(c.phone)) ? c.phone.trim() : null;

    const quote = supported.map((s) => ({ s, text: nearName(s.pool, name, 100) })).find((x) => x.text);
    const type = classifyType(titleShown || near);
    const sources = supported.map((s) =>
      newSource({
        url: s.result.url,
        type: companyDomain && hostOf(s.u) && hostOf(s.u).replace(/[^a-z0-9]/g, "").includes(companyHostPart.replace(/[^a-z0-9]/g, "")) ? "company site" : "search result",
        evidence: nearName(s.pool, name, 110) || s.result.title,
        now,
      }),
    );

    seenNames.add(normName(name));
    contacts.push(
      newContact(
        {
          id: newId(),
          name,
          title: titleShown,
          company: job.company,
          department: squash(c.department ?? "").slice(0, L.department),
          linkedinUrl,
          bioQuote: quote ? { text: quote.text.slice(0, L.bio), url: quote.s.result.url } : null,
          businessEmail: email,
          businessPhone: phone,
          type,
          status: score.status,
          confidence: score.confidence,
          lastVerifiedAt: todayLocal(now),
          sources,
          jobs: [{ jobKey: job.jobKey, jobTitle: job.jobTitle, company: job.company, relationship: type, relevance: relevanceFor({ type, title: titleShown, department: c.department ?? "", jobTitle: job.jobTitle, jobSpecific, senior }) }],
          origin: "found",
          aiNote: c.note ? squash(c.note).slice(0, L.aiNote) : null,
          cautions,
        },
        now,
      ),
    );
  }

  contacts.sort((a, b) => (b.jobs[0]?.relevance ?? 0) - (a.jobs[0]?.relevance ?? 0) || b.confidence - a.confidence);
  return { contacts: contacts.slice(0, L.candidatesMax), dropped };
}
