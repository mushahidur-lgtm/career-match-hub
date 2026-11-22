import { newId } from "@/lib/ids";
import { todayLocal } from "@/lib/applications";
import { normalizeCompany, normalizeTitle } from "@/lib/dedupe";
import { CONTACT_LIMITS as L, type Contact } from "@/types/contacts";
import { inferDepartments, jobCity } from "./departments";
import { classifyType, emailBelongsTo, isLinkedInProfile, isSeniorHr, newContact, newSource, normName, relevanceFor, scoreEvidence } from "./model";

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

/** The full text of a page the search tool read. This is real page text, so a person named in it can be checked far more fully than from a short citation. */
export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

export interface WebEvidence {
  results: SearchResultInfo[];
  citations: Citation[];
  pages?: FetchedPage[];
}

/** What the model claimed. Untrusted: each part is checked against the evidence. */
export interface RawCandidate {
  name: string;
  title?: string;
  company?: string;
  department?: string;
  location?: string;
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
  location?: string;
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

/**
 * Whether a detail found at position `at` in a passage belongs to this person: it must be close to their name, and no other
 * person named in the same passage may be closer. A detail elsewhere on the page, or beside someone else, is not theirs.
 */
function ownedBy(line: string, name: string, at: number, others: string[], max = 150): boolean {
  if (at < 0) return false;
  const m = nameRegex(name)?.exec(line);
  if (!m) return false;
  const dist = (x: RegExpExecArray) => Math.min(Math.abs(at - x.index), Math.abs(at - (x.index + x[0].length)));
  const mine = dist(m);
  if (mine > max) return false;
  for (const o of others) {
    const mo = nameRegex(o)?.exec(line);
    if (mo && dist(mo) < mine) return false;
  }
  return true;
}

/** A line longer than this is broken at sentence ends, so one person's passage cannot cover a whole page that arrived as a single line. */
const LONG_LINE = 400;
const splitLongLines = (text: string) => text.split("\n").map((l) => (l.length > LONG_LINE ? l.replace(/([.!?])\s+(?=[A-Z])/g, "$1\n") : l)).join("\n");

/** How far either side of a name (in characters) the company, role and job must appear to count as being about that person. */
const WINDOW = 250;

/** Page text kept per source. Enough for a team page, bounded so one huge page cannot swamp the rest. */
const MAX_PAGE_CHARS = 80_000;

/** Words that say someone is no longer in the role. Employment is never assumed to be current without support. */
const PAST_SIGNAL = /\b(?:former|formerly|previously|ex-|left (?:the company|in)|until (?:19|20)\d\d|no longer|alumn|retired|was (?:a|the|an) )/i;

/**
 * A different employer named right after "at" in the person's own passage ("Rosa Lindgren, Recruiter at Westfield Group"). A page on
 * this company's own site that says someone works for another company must not give them credit as this company's contact.
 */
function namesAnotherEmployer(near: string, companyNorm: string): boolean {
  const words = new Set(["the", "our", "a", "an", "this", "that", "your", "its", "their"]);
  for (const m of near.matchAll(/\bat\s+((?:[A-Z][\w&.'-]*)(?:\s+(?:[A-Z][\w&.'-]*|&|and|of)){0,4})/g)) {
    const phrase = m[1].split(/\s+/).filter((w) => !words.has(w.toLowerCase())).join(" ");
    const norm = normalizeCompany(phrase);
    if (norm && !companyNorm.includes(norm) && !norm.includes(companyNorm)) return true;
  }
  return false;
}

const BAD_NAME = /\b(team|careers?|department|recruiting|recruitment|hr|human resources|talent acquisition|opportunit|hiring)\b/i;

export function verifyCandidates(raw: RawCandidate[], ev: WebEvidence, job: JobContext, now = new Date()): { contacts: Contact[]; dropped: Dropped[] } {
  const resultByUrl = new Map(ev.results.map((r) => [urlKey(r.url), r]));
  // A page the tool read was reached from a search result, so it is a legitimate source even if listed only as a page.
  for (const p of ev.pages ?? []) if (!resultByUrl.has(urlKey(p.url))) resultByUrl.set(urlKey(p.url), { url: p.url, title: p.title });
  const poolByUrl = new Map<string, string>();
  for (const r of resultByUrl.values()) poolByUrl.set(urlKey(r.url), r.title);
  for (const p of ev.pages ?? []) {
    const k = urlKey(p.url);
    // Page text can arrive as one long line. Breaking it at sentence ends keeps one person's passage from covering the whole page.
    poolByUrl.set(k, `${poolByUrl.get(k) ?? ""}\n${splitLongLines(p.text.slice(0, MAX_PAGE_CHARS))}`);
  }
  for (const c of ev.citations) {
    const k = urlKey(c.url);
    poolByUrl.set(k, `${poolByUrl.get(k) ?? ""}\n${c.citedText}`);
  }
  const hints = inferDepartments({ title: job.jobTitle, category: "Other", description: "" });
  const city = jobCity(job.location ?? "");

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

    // Each source is judged on its own passage: the one that mentions the person. Evidence elsewhere on the same page
    // (another person's title, a job named in a different paragraph) is never credited to them.
    const per = urls
      .map((u) => ({ u, pool: poolByUrl.get(u) ?? "", result: resultByUrl.get(u)! }))
      .filter((x) => mentions(x.pool, name))
      .map((x) => {
        const line = lineWith(x.pool, name);
        const host = hostOf(x.u);
        const nearText = nearName(x.pool, name);
        const onDomainHost = companyHostPart.length > 2 && host.replace(/[^a-z0-9]/g, "").includes(companyHostPart.replace(/[^a-z0-9]/g, ""));
        // Company and job must be near the name (about 250 characters either side), not merely somewhere on the same line.
        const windowText = nearName(x.pool, name, WINDOW);
        const companyInPassage = companyKnown && normalizeCompany(windowText).includes(companyNorm);
        // Being on the company's own site counts only while the passage does not say they work somewhere else.
        const onDomain = onDomainHost && (companyInPassage || !namesAnotherEmployer(nearText, companyNorm));
        return {
          ...x,
          line,
          near: nearName(x.pool, name),
          role: roleNearest(x.pool, name),
          host,
          onDomain,
          company: companyInPassage,
          jobHit: (jobTitleNorm.length > 4 && normalizeTitle(windowText).includes(jobTitleNorm)) || (applyKey !== null && x.u === applyKey),
        };
      });
    if (!per.length) {
      reject("No source text or result title contained this name.");
      continue;
    }

    const near = per.map((p) => p.near).join(" ");
    const roleText = per.map((p) => p.role).find(Boolean) ?? null;
    const roleInSource = per.some((p) => p.role || ROLE_WORDS.test(p.near));
    const companyDomain = per.some((p) => p.onDomain);
    // A person at another employer must never be listed for this one: the passage has to name the employer, or be on its own site.
    const companyInSource = per.some((p) => p.company) || companyDomain;
    if (!companyInSource) {
      reject(`No source ties this person to ${job.company}.`);
      continue;
    }
    const jobSpecific = per.some((p) => p.jobHit);
    const hosts = new Set(per.map((p) => p.host).filter(Boolean));

    // A title is kept only if a source says it. Otherwise the role words the source does show are used, or none.
    const claimedTitle = squash(c.title ?? "");
    const titleShown = claimedTitle && normName(near).includes(normName(claimedTitle)) ? claimedTitle : (roleText ?? "");
    const cautions: string[] = [];
    if (claimedTitle && !titleShown) cautions.push("The title suggested by the search was not confirmed by a source, so it is left out.");

    // A profile link counts only if it is literally a search result, and its result title shows this person at this employer.
    const li = c.linkedinUrl && isLinkedInProfile(c.linkedinUrl) && resultByUrl.has(urlKey(c.linkedinUrl)) ? c.linkedinUrl.trim() : null;
    const liResult = li ? resultByUrl.get(urlKey(li)) : null;
    const liTitle = liResult ? normName(liResult.title) : "";
    const linkedinConfirms = Boolean(liResult && mentions(liResult.title, name) && liTitle.length > 0 && normalizeCompany(liResult.title).includes(companyNorm));
    const linkedinUrl = li && linkedinConfirms ? li : null;
    if (c.linkedinUrl && !linkedinUrl) cautions.push("A profile link was suggested, but it was not a search result that matched this person at this employer, so it is left out.");

    // Location and department are kept only if the passage says them. Employment is treated as current only if nothing says otherwise.
    const nearFold = near.toLowerCase();
    const wantLoc = squash(c.location ?? "");
    const location = wantLoc && nearFold.includes(wantLoc.toLowerCase().split(",")[0].trim()) ? wantLoc.slice(0, L.location) : "";
    const wantDept = squash(c.department ?? "");
    const department = wantDept && nearFold.includes(wantDept.toLowerCase()) ? wantDept.slice(0, L.department) : "";
    const past = per.some((p) => PAST_SIGNAL.test(p.near));
    const locationMatch = Boolean(city) && (nearFold.includes(city) || location.toLowerCase().includes(city));

    const senior = isSeniorHr(titleShown || claimedTitle);
    const score = scoreEvidence({ nameInSource: true, companyInSource, roleInSource, jobSpecific, companyDomain, linkedinConfirms, distinctSources: hosts.size, senior });
    if (!score) {
      reject("The sources do not tie this person to the company or to a recruiting role.");
      continue;
    }
    if (past) cautions.push("A source suggests they may no longer be in this role, so check before reaching out.");
    if (senior && !jobSpecific) cautions.push("A senior HR leader. Nothing found says they handle this posting.");
    if (!jobSpecific) cautions.push("No source names this job next to them, so check that they cover this role.");

    // An email or phone is kept only if it sits next to this person's name in a passage and no other person named there is
    // closer. One elsewhere on the page, or beside someone else, is not theirs.
    const others = raw.map((r) => squash(r.name ?? "")).filter((n) => n && normName(n) !== normName(name));
    const wantEmail = c.email?.trim() ?? "";
    const email = wantEmail && emailBelongsTo(name, wantEmail) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wantEmail) && per.some((p) => ownedBy(p.line, name, p.line.toLowerCase().indexOf(wantEmail.toLowerCase()), others)) ? wantEmail : null;
    const wantDigits = (c.phone ?? "").replace(/\D/g, "");
    const phone =
      c.phone && wantDigits.length >= 10 && per.some((p) => ownedBy(p.line, name, p.line.search(new RegExp(wantDigits.split("").join("\\D*"))), others))
        ? c.phone.trim()
        : null;

    const quote = per.map((p) => ({ s: p, text: nearName(p.pool, name, 100) })).find((x) => x.text);
    const type = classifyType(titleShown || near);
    const sources = per.map((p) =>
      newSource({
        url: p.result.url,
        type: p.onDomain ? "company site" : "search result",
        evidence: nearName(p.pool, name, 110) || p.result.title,
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
          department,
          location,
          linkedinUrl,
          bioQuote: quote ? { text: quote.text.slice(0, L.bio), url: quote.s.result.url } : null,
          businessEmail: email,
          businessPhone: phone,
          type,
          status: past ? "Possible match" : score.status,
          confidence: past ? Math.min(score.confidence, 40) : score.confidence,
          lastVerifiedAt: todayLocal(now),
          sources,
          jobs: [{ jobKey: job.jobKey, jobTitle: job.jobTitle, company: job.company, location: job.location, relationship: type, jobSpecific, relevance: relevanceFor({ type, title: titleShown, department, jobTitle: job.jobTitle, jobSpecific, senior, locationMatch, departmentHints: hints }) }],
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
