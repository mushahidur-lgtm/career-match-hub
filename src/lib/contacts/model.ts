import { addDays, daysBetween, plausibleDay, todayLocal } from "@/lib/applications";
import { normalizeCompany } from "@/lib/dedupe";
import { newId } from "@/lib/ids";
import {
  CONTACT_LIMITS as L,
  NETWORK_STAGES,
  type ActivityType,
  type Contact,
  type ContactSource,
  type ContactStatus,
  type ContactsStore,
  type ContactType,
  type FindRecord,
  type JobLink,
  type NetworkingActivity,
  type NetworkStage,
} from "@/types/contacts";

/* ---------- names and identity ---------- */

const HONORIFICS = /\b(?:dr|mr|mrs|ms|miss|mx|prof)\b\.?/gi;

/** "Dr. José  O'Brien" and "jose obrien" are the same name. */
export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(HONORIFICS, " ")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The handle in a public LinkedIn profile address, or null for anything that is not one. */
export function linkedinHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{2,100})\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

export const isLinkedInProfile = (url: string | null | undefined) => linkedinHandle(url) !== null;

/** Two contacts are the same person when they share a profile, or an exact name at the same employer. */
export function contactKey(c: Pick<Contact, "name" | "company" | "linkedinUrl">): string {
  const h = linkedinHandle(c.linkedinUrl);
  return h ? `li:${h}` : `n:${normName(c.name)}|${normalizeCompany(c.company)}`;
}

export const sameContact = (a: Pick<Contact, "name" | "company" | "linkedinUrl">, b: Pick<Contact, "name" | "company" | "linkedinUrl">) => contactKey(a) === contactKey(b);

/**
 * People who might be the same but are not certain to be: the same surname and first initial at the same employer.
 * They are flagged, never merged, because two people at a large employer can share a name.
 */
export function possibleDuplicates(list: Contact[], c: Pick<Contact, "id" | "name" | "company" | "linkedinUrl">): Contact[] {
  const parts = (n: string) => {
    const p = normName(n).split(" ").filter(Boolean);
    return { first: p[0] ?? "", last: p[p.length - 1] ?? "" };
  };
  const me = parts(c.name);
  const company = normalizeCompany(c.company);
  return list.filter((o) => {
    if (o.id === c.id || sameContact(o, c)) return false;
    const other = parts(o.name);
    return Boolean(me.last) && me.last === other.last && me.first[0] === other.first[0] && normalizeCompany(o.company) === company;
  });
}

/* ---------- what kind of person ---------- */

export function classifyType(title: string): ContactType {
  const t = title.toLowerCase();
  if (/talent acquisition|talent partner|talent specialist|talent advisor|sourcer|ta partner/.test(t)) return "Talent Acquisition";
  if (/recruit/.test(t)) return "Recruiter";
  if (/hiring manager/.test(t)) return "Hiring Manager";
  if (/human resources|\bhr\b|hrbp|people (?:partner|operations|business|&|and) ?|people and culture|people & culture/.test(t)) return "HR Manager";
  if (/director|head of|\bvp\b|vice president|chief|lead\b/.test(t)) return "Department Head";
  return "Other";
}

const HR_WORDS = /human resources|\bhr\b|hrbp|people (?:and|&) culture|people operations|talent/i;
const SENIOR = /chief|\bchro\b|\bcpo\b|\bvp\b|vice president|\bsvp\b|\bevp\b|head of|director of|global head/i;

/** A senior HR executive is not assumed to be responsible for one job posting. */
export const isSeniorHr = (title: string) => SENIOR.test(title) && HR_WORDS.test(title);

/* ---------- confidence, from the evidence, by fixed rules ---------- */

export interface Evidence {
  /** The person's name appears in what a source actually says. Required. */
  nameInSource: boolean;
  companyInSource: boolean;
  /** A recruiting or HR role is stated in the source. */
  roleInSource: boolean;
  /** The source ties the person to this posting: it is the posting, or names the job. */
  jobSpecific: boolean;
  companyDomain: boolean;
  linkedinConfirms: boolean;
  distinctSources: number;
  senior: boolean;
}

export const MAX_CONFIDENCE = 98;

/**
 * Turns evidence into a confidence and a status. The AI does not supply either number: they come only from
 * what the sources say. Returns null when the evidence is too thin to show at all (no name in a source).
 */
export function scoreEvidence(e: Evidence): { confidence: number; status: ContactStatus } | null {
  if (!e.nameInSource) return null;
  if (!e.companyInSource && !e.roleInSource && !e.jobSpecific) return null;
  let score = 25;
  if (e.companyInSource) score += 20;
  if (e.roleInSource) score += 20;
  if (e.jobSpecific) score += 20;
  if (e.companyDomain) score += 5;
  if (e.linkedinConfirms) score += 5;
  score += Math.min(10, Math.max(0, e.distinctSources - 1) * 5);
  const confidence = Math.min(MAX_CONFIDENCE, score);

  let status: ContactStatus = "Possible match";
  if (e.companyInSource && e.roleInSource && e.jobSpecific) status = "Verified";
  else if (e.companyInSource && e.roleInSource) status = "Likely match";
  // A senior HR leader is plausible, but nothing says they handle this role, so they cannot rank above "possible".
  if (e.senior && !e.jobSpecific) status = "Possible match";
  return { confidence, status };
}

const STATUS_RANK: Record<ContactStatus, number> = { "Possible match": 1, "Likely match": 2, Verified: 3 };
export const betterStatus = (a: ContactStatus, b: ContactStatus): ContactStatus => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b);

const TYPE_BASE: Record<ContactType, number> = { Recruiter: 60, "Talent Acquisition": 60, "Hiring Manager": 65, "Department Head": 45, "HR Manager": 35, Other: 15 };
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2));

/** How directly a person relates to one job: their role, whether the evidence names the job, and whether their area fits. */
export function relevanceFor(input: { type: ContactType; title: string; department: string; jobTitle: string; jobSpecific: boolean; senior: boolean }): number {
  let score = TYPE_BASE[input.type];
  if (input.jobSpecific) score += 25;
  const job = tokens(input.jobTitle);
  const area = tokens(`${input.department} ${input.title}`);
  if ([...job].some((t) => area.has(t) && !["engineer", "senior", "developer", "manager", "specialist", "analyst"].includes(t))) score += 10;
  if (input.senior && !input.jobSpecific) score -= 20;
  return Math.max(0, Math.min(100, score));
}

/* ---------- building and limiting contacts ---------- */

const cut = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);

export function newSource(init: { url: string; type: ContactSource["type"]; evidence: string; now?: Date }): ContactSource {
  return { id: newId(), url: cut(init.url, L.url), type: init.type, evidence: cut(init.evidence, L.evidence), discoveredAt: (init.now ?? new Date()).toISOString() };
}

export function newContact(init: Partial<Contact> & Pick<Contact, "name" | "company">, now = new Date()): Contact {
  const title = init.title ?? "";
  return clampContact({
    id: init.id ?? newId(),
    name: init.name,
    title,
    company: init.company,
    department: init.department ?? "",
    linkedinUrl: init.linkedinUrl ?? null,
    bioQuote: init.bioQuote ?? null,
    businessEmail: init.businessEmail ?? null,
    businessPhone: init.businessPhone ?? null,
    type: init.type ?? classifyType(title),
    status: init.status ?? "Possible match",
    confidence: init.confidence ?? 0,
    lastVerifiedAt: init.lastVerifiedAt ?? todayLocal(now),
    sources: init.sources ?? [],
    jobs: init.jobs ?? [],
    origin: init.origin ?? "found",
    aiNote: init.aiNote ?? null,
    cautions: init.cautions ?? [],
    stage: init.stage ?? "Discovered",
    notes: init.notes ?? "",
    activities: init.activities ?? [],
    applicationJobIds: init.applicationJobIds ?? [],
    nextFollowUp: init.nextFollowUp ?? null,
    createdAt: init.createdAt ?? now.toISOString(),
    updatedAt: init.updatedAt ?? now.toISOString(),
  });
}

/** Cuts every field to what is stored and read back, so nothing you can type makes a contact unreadable. */
export function clampContact(c: Contact): Contact {
  return {
    ...c,
    name: cut(c.name, L.name),
    title: cut(c.title, L.title),
    company: cut(c.company, L.company),
    department: cut(c.department, L.department),
    linkedinUrl: c.linkedinUrl ? cut(c.linkedinUrl, L.url) : null,
    bioQuote: c.bioQuote ? { text: cut(c.bioQuote.text, L.bio), url: cut(c.bioQuote.url, L.url) } : null,
    businessEmail: c.businessEmail ? cut(c.businessEmail, L.email) : null,
    businessPhone: c.businessPhone ? cut(c.businessPhone, L.phone) : null,
    confidence: Math.max(0, Math.min(MAX_CONFIDENCE, Math.round(c.confidence))),
    sources: c.sources.slice(0, L.sourcesMax).map((s) => ({ ...s, url: cut(s.url, L.url), evidence: cut(s.evidence, L.evidence) })),
    jobs: c.jobs.slice(0, L.jobsMax).map((j) => ({ ...j, jobKey: cut(j.jobKey, 500), jobTitle: cut(j.jobTitle, 200), company: cut(j.company, L.company), location: j.location ? cut(j.location, 200) : undefined, relevance: Math.max(0, Math.min(100, Math.round(j.relevance))) })),
    aiNote: c.aiNote ? cut(c.aiNote, L.aiNote) : null,
    cautions: c.cautions.slice(0, 5).map((x) => cut(x, L.caution)),
    notes: cut(c.notes, L.notes),
    activities: c.activities.slice(-L.activitiesMax).map((a) => ({ ...a, notes: cut(a.notes, L.activityNotes) })),
    applicationJobIds: c.applicationJobIds.slice(0, 50).map((x) => cut(x, 200)),
  };
}

/* ---------- combining ---------- */

const unionBy = <T,>(a: T[], b: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of [...a, ...b]) {
    const k = key(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
};

/**
 * Folds new findings about a person into what is already saved. Evidence only ever accumulates: sources and job
 * links are added, the stronger status and confidence win, and nothing you wrote (notes, stage, history) is touched.
 */
export function mergeFindings(existing: Contact, found: Contact, now = new Date()): Contact {
  const status = betterStatus(existing.status, found.status);
  return clampContact({
    ...existing,
    title: existing.title || found.title,
    department: existing.department || found.department,
    linkedinUrl: existing.linkedinUrl ?? found.linkedinUrl,
    bioQuote: existing.bioQuote ?? found.bioQuote,
    businessEmail: existing.businessEmail ?? found.businessEmail,
    businessPhone: existing.businessPhone ?? found.businessPhone,
    status,
    confidence: Math.max(existing.confidence, found.confidence),
    lastVerifiedAt: existing.lastVerifiedAt > found.lastVerifiedAt ? existing.lastVerifiedAt : found.lastVerifiedAt,
    sources: unionBy(existing.sources, found.sources, (s) => `${s.url}|${s.evidence}`),
    jobs: unionBy(found.jobs, existing.jobs, (j) => j.jobKey),
    cautions: unionBy(existing.cautions, found.cautions, (x) => x),
    aiNote: existing.aiNote ?? found.aiNote,
    updatedAt: now.toISOString(),
  });
}

/* ---------- the store ---------- */

export interface SaveResult {
  store: ContactsStore;
  contact: Contact;
  /** True when this person was already saved and the new evidence was added to them. */
  merged: boolean;
  /** Saved contacts that might be the same person but are not certain. */
  possibleDuplicates: Contact[];
  /** False when the limit was reached and nothing was saved. */
  saved: boolean;
}

/** Saves a contact a lookup found. A person already saved gets the new evidence added instead of a second copy. */
export function saveContact(store: ContactsStore, incoming: Contact, now = new Date()): SaveResult {
  const existing = store.contacts.find((c) => sameContact(c, incoming));
  if (existing) {
    const merged = mergeFindings(existing, incoming, now);
    return { store: { ...store, contacts: store.contacts.map((c) => (c.id === existing.id ? merged : c)) }, contact: merged, merged: true, possibleDuplicates: [], saved: true };
  }
  const dupes = possibleDuplicates(store.contacts, incoming);
  if (store.contacts.length >= L.contactsMax) return { store, contact: incoming, merged: false, possibleDuplicates: dupes, saved: false };
  const contact = clampContact({ ...incoming, stage: incoming.stage ?? "Discovered", updatedAt: now.toISOString() });
  return { store: { ...store, contacts: [contact, ...store.contacts] }, contact, merged: false, possibleDuplicates: dupes, saved: true };
}

export const updateContact = (store: ContactsStore, id: string, patch: Partial<Contact>, now = new Date()): ContactsStore => ({
  ...store,
  contacts: store.contacts.map((c) => (c.id === id ? clampContact({ ...c, ...patch, id: c.id, updatedAt: now.toISOString() }) : c)),
});

/** Deletes a contact and remembers the deletion, so syncing with another device cannot bring it back. */
export function deleteContact(store: ContactsStore, id: string): ContactsStore {
  return { ...store, contacts: store.contacts.filter((c) => c.id !== id), deletedIds: [...new Set([...store.deletedIds, id])].slice(-L.deletedMax) };
}

/** The user states that they checked the evidence themselves. */
export const markVerified = (store: ContactsStore, id: string, now = new Date()): ContactsStore =>
  updateContact(store, id, { status: "Verified", lastVerifiedAt: todayLocal(now) }, now);

export function linkApplication(store: ContactsStore, id: string, jobId: string, link?: JobLink): ContactsStore {
  return {
    ...store,
    contacts: store.contacts.map((c) =>
      c.id === id
        ? clampContact({ ...c, applicationJobIds: [...new Set([...c.applicationJobIds, jobId])], jobs: link ? unionBy([link], c.jobs, (j) => j.jobKey) : c.jobs })
        : c,
    ),
  };
}

export const unlinkApplication = (store: ContactsStore, id: string, jobId: string): ContactsStore => ({
  ...store,
  contacts: store.contacts.map((c) => (c.id === id ? { ...c, applicationJobIds: c.applicationJobIds.filter((j) => j !== jobId) } : c)),
});

/** Keeps the latest lookup per job, so a job is not searched again unless you ask. */
export function recordFind(store: ContactsStore, find: FindRecord): ContactsStore {
  const finds = [find, ...store.finds.filter((f) => f.jobKey !== find.jobKey)].slice(0, L.findsMax);
  return { ...store, finds: finds.map((f) => ({ ...f, candidates: f.candidates.slice(0, L.candidatesMax) })) };
}

export const findFor = (store: ContactsStore, jobKey: string): FindRecord | null => store.finds.find((f) => f.jobKey === jobKey) ?? null;

export const contactsForJob = (store: ContactsStore, jobKey: string): Contact[] =>
  store.contacts.filter((c) => c.jobs.some((j) => j.jobKey === jobKey)).sort((a, b) => (b.jobs.find((j) => j.jobKey === jobKey)?.relevance ?? 0) - (a.jobs.find((j) => j.jobKey === jobKey)?.relevance ?? 0));

/** Contacts saved by the user are kept; two stores (two devices, or a backup) are combined without losing either or reviving a deletion. */
export function mergeContactStores(a: ContactsStore, b: ContactsStore): ContactsStore {
  const deleted = new Set([...a.deletedIds, ...b.deletedIds]);
  const out: Contact[] = [];
  for (const c of [...a.contacts, ...b.contacts]) {
    if (deleted.has(c.id)) continue;
    const i = out.findIndex((o) => o.id === c.id || sameContact(o, c));
    if (i < 0) {
      out.push(c);
      continue;
    }
    // The more recently edited copy keeps your own fields (notes, stage); evidence from both is combined.
    const [newer, older] = out[i].updatedAt >= c.updatedAt ? [out[i], c] : [c, out[i]];
    out[i] = clampContact({
      ...mergeFindings(newer, older, new Date(newer.updatedAt)),
      id: out[i].id,
      updatedAt: newer.updatedAt,
      activities: unionBy(newer.activities, older.activities, (x) => x.id).sort((x, y) => x.date.localeCompare(y.date)),
      applicationJobIds: [...new Set([...newer.applicationJobIds, ...older.applicationJobIds])],
    });
  }
  const finds = unionBy(a.finds, b.finds, (f) => f.id).sort((x, y) => y.at.localeCompare(x.at)).slice(0, L.findsMax);
  return { contacts: out.slice(0, L.contactsMax), deletedIds: [...deleted].slice(-L.deletedMax), finds };
}

/* ---------- networking pipeline ---------- */

const stageIndex = (s: NetworkStage) => NETWORK_STAGES.indexOf(s);

/** What each kind of activity means for where the relationship stands. It only ever moves forward. */
const STAGE_FOR: Partial<Record<ActivityType, NetworkStage>> = {
  "Connection request sent": "Connection Requested",
  "Connection accepted": "Connected",
  "Message sent": "Conversation",
  "Email sent": "Conversation",
  "Reply received": "Conversation",
  "Call or meeting": "Conversation",
  "Follow-up sent": "Follow-up",
};

export function newActivity(init: Partial<NetworkingActivity> & Pick<NetworkingActivity, "type">, now = new Date()): NetworkingActivity {
  return {
    id: init.id ?? newId(),
    type: init.type,
    date: init.date && plausibleDay(init.date) ? init.date : todayLocal(now),
    jobKey: init.jobKey ?? null,
    notes: cut(init.notes, L.activityNotes),
    nextFollowUp: init.nextFollowUp && plausibleDay(init.nextFollowUp) ? init.nextFollowUp : null,
  };
}

/** Records something that happened. Only what the user records is ever treated as having happened. */
export function logActivity(store: ContactsStore, id: string, activity: NetworkingActivity, now = new Date()): ContactsStore {
  return {
    ...store,
    contacts: store.contacts.map((c) => {
      if (c.id !== id) return c;
      const target = STAGE_FOR[activity.type];
      const stage = target && stageIndex(target) > stageIndex(c.stage) ? target : c.stage;
      // A follow-up that was sent is done. A new date, if given, sets the next one.
      const nextFollowUp = activity.nextFollowUp ?? (activity.type === "Follow-up sent" || activity.type === "Reply received" ? null : c.nextFollowUp);
      return clampContact({ ...c, stage, nextFollowUp, activities: [...c.activities, activity], updatedAt: now.toISOString() });
    }),
  };
}

export const removeActivity = (store: ContactsStore, id: string, activityId: string): ContactsStore => ({
  ...store,
  contacts: store.contacts.map((c) => (c.id === id ? { ...c, activities: c.activities.filter((a) => a.id !== activityId) } : c)),
});

/** Whether you have actually been in touch, from what was recorded. Drafts use this and never assume it. */
export function priorContact(c: Contact): { requested: boolean; connected: boolean; messaged: boolean; replied: boolean; lastDate: string | null } {
  const has = (t: ActivityType) => c.activities.some((a) => a.type === t);
  const dates = c.activities.map((a) => a.date).sort();
  return {
    requested: has("Connection request sent"),
    connected: has("Connection accepted"),
    messaged: has("Message sent") || has("Email sent") || has("Follow-up sent"),
    replied: has("Reply received"),
    lastDate: dates[dates.length - 1] ?? null,
  };
}

/* ---------- reminders ---------- */

export interface ContactReminder {
  id: string;
  contactId: string;
  name: string;
  company: string;
  date: string;
  label: string;
  when: string;
  overdue: boolean;
  daysAway: number;
}

const whenText = (days: number) => (days < 0 ? `Overdue by ${-days} ${days === -1 ? "day" : "days"}` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

/** Follow-ups you set on contacts that are overdue or due within the next week, most urgent first. */
export function contactReminders(contacts: Contact[], now = new Date(), horizon = 7): ContactReminder[] {
  const today = todayLocal(now);
  const out: ContactReminder[] = [];
  for (const c of contacts) {
    if (!c.nextFollowUp || !plausibleDay(c.nextFollowUp)) continue;
    const days = daysBetween(today, c.nextFollowUp);
    if (days > horizon) continue;
    out.push({ id: `contact:${c.id}:${c.nextFollowUp}`, contactId: c.id, name: c.name, company: c.company, date: c.nextFollowUp, label: `Follow up with ${c.name} at ${c.company}`, when: whenText(days), overdue: days < 0, daysAway: days });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/** A default follow-up date: a week out, from today. */
export const defaultFollowUp = (now = new Date()) => addDays(todayLocal(now), 7);

/* ---------- numbers for the dashboard and insights ---------- */

export const MIN_REQUESTS_FOR_RATE = 5;

export function networkingStats(contacts: Contact[]) {
  const byStage = NETWORK_STAGES.map((stage) => ({ label: stage, value: contacts.filter((c) => c.stage === stage).length }));
  const requested = contacts.filter((c) => priorContact(c).requested).length;
  const accepted = contacts.filter((c) => priorContact(c).connected).length;
  const replied = contacts.filter((c) => priorContact(c).replied).length;
  const reached = contacts.filter((c) => priorContact(c).messaged || priorContact(c).requested).length;
  return {
    total: contacts.length,
    byStage,
    requested,
    accepted,
    replied,
    reached,
    enough: requested >= MIN_REQUESTS_FOR_RATE,
    acceptRate: requested >= MIN_REQUESTS_FOR_RATE ? Math.round((accepted / requested) * 100) : null,
    replyRate: reached >= MIN_REQUESTS_FOR_RATE ? Math.round((replied / reached) * 100) : null,
  };
}
