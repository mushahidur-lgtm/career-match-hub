import { profileSkills } from "@/lib/heuristics";
import { parseRequirements } from "@/lib/matching/requirements";
import { canonicalSkill, extractSkills, flattenSkills } from "@/lib/skills";
import type { Contact } from "@/types/contacts";
import type { CandidateProfile } from "@/types/job";
import { priorContact } from "./model";

/**
 * Message drafts for reaching a recruiter. The app never sends anything: these are text to review, copy and send yourself.
 * A draft states only what is true. It says you have been in touch only when that was recorded, says you applied only if the
 * application was recorded, and mentions only skills that are on your resume and in the posting.
 */

export type DraftKind = "connection" | "intro" | "follow-up" | "email";
export const DRAFT_LABELS: Record<DraftKind, string> = { connection: "LinkedIn connection request", intro: "Introduction message", "follow-up": "Follow-up message", email: "Email" };

/** LinkedIn's usual limit for a connection note. Check your own account: it can differ. */
export const CONNECTION_NOTE_LIMIT = 300;

export interface DraftJob {
  title: string;
  company: string;
  description: string;
}

export interface DraftInput {
  kind: DraftKind;
  contact: Pick<Contact, "name" | "title" | "activities" | "company">;
  job: DraftJob;
  profile: CandidateProfile | null;
  /** The date you applied, only if it was recorded. */
  appliedAt: string | null;
}

export interface Draft {
  kind: DraftKind;
  subject: string | null;
  body: string;
  /** Plain-language notes about what the draft assumes or leaves for you to fill in. */
  notes: string[];
  /** True when an AI wrote it. Those drafts are checked, and shown labelled. */
  ai: boolean;
}

export const YOUR_NAME = "[Your name]";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** Skills the posting asks for that are also on the resume, most important first. Never a skill the resume lacks. */
export function sharedSkills(job: DraftJob, profile: CandidateProfile | null, max = 3): string[] {
  if (!profile) return [];
  const mine = new Set(profileSkills(profile.skills).map((s) => s.toLowerCase()));
  const asked = parseRequirements(job.title, job.description);
  return [...asked.required, ...asked.preferred].map(canonicalSkill).filter((s, i, a) => mine.has(s.toLowerCase()) && a.indexOf(s) === i).slice(0, max);
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function lastOn(c: Pick<Contact, "activities">, types: string[]): string | null {
  const dates = c.activities.filter((a) => types.includes(a.type)).map((a) => a.date).sort();
  return dates[dates.length - 1] ?? null;
}

const experience = (p: CandidateProfile | null) => (p?.yearsOfExperience ? `${p.yearsOfExperience} years of experience` : null);

export function buildDraft(input: DraftInput): Draft {
  const { kind, contact, job, profile, appliedAt } = input;
  const first = firstName(contact.name);
  const prior = priorContact(contact as Contact);
  const skills = sharedSkills(job, profile);
  const notes: string[] = [`Replace ${YOUR_NAME} with your name before sending.`];
  const interest = appliedAt ? `I applied for the ${job.title} role at ${job.company} on ${appliedAt}.` : `I am interested in the ${job.title} role at ${job.company}.`;
  const background = skills.length ? `My background includes ${list(skills)}${experience(profile) ? `, with ${experience(profile)}` : ""}.` : experience(profile) ? `I bring ${experience(profile)}.` : "";
  if (!job.description.trim()) notes.push("The posting text is not available here, so no skills are mentioned. Add something true that fits.");
  else if (!skills.length && profile) notes.push("None of the posting's skills were found on your resume, so no skills are mentioned. Add something true that fits.");
  if (!profile) notes.push("No resume is selected, so nothing about your background is included.");

  if (kind === "connection") {
    let body = `Hi ${first}, ${interest} ${background} I would be glad to connect.`.replace(/\s+/g, " ").trim();
    if (body.length > CONNECTION_NOTE_LIMIT) body = `Hi ${first}, ${interest} I would be glad to connect.`;
    if (body.length > CONNECTION_NOTE_LIMIT) body = `Hi ${first}, I am interested in the ${job.title} role at ${job.company} and would be glad to connect.`;
    notes.push(`Kept under ${CONNECTION_NOTE_LIMIT} characters, LinkedIn's usual limit for a connection note. Check yours.`);
    return { kind, subject: null, body: body.replace(YOUR_NAME, "").trim(), notes: notes.filter((n) => !n.startsWith("Replace")), ai: false };
  }

  if (kind === "follow-up") {
    let opening: string;
    if (prior.replied) opening = `Thank you for getting back to me${lastOn(contact, ["Reply received"]) ? ` on ${lastOn(contact, ["Reply received"])}` : ""}.`;
    else if (prior.messaged) opening = `I wrote to you on ${lastOn(contact, ["Message sent", "Email sent", "Follow-up sent"])} about the ${job.title} role at ${job.company} and wanted to follow up.`;
    else if (prior.requested) opening = `I sent you a connection request on ${lastOn(contact, ["Connection request sent"])} about the ${job.title} role at ${job.company}.`;
    else {
      opening = `I am writing about the ${job.title} role at ${job.company}.`;
      notes.push("No contact with this person is recorded, so this reads as a first message, not a follow-up. Record a connection request or message first if you have sent one.");
    }
    const body = [`Hi ${first},`, `${opening} ${appliedAt ? `I applied on ${appliedAt} and remain very interested.` : "I remain very interested."}`, "Is there anything further I can send that would help?", `Thank you for your time.\n${YOUR_NAME}`].join("\n\n");
    return { kind, subject: null, body, notes, ai: false };
  }

  const body = [
    `Hi ${first},`,
    `${interest} ${background}`.replace(/\s+/g, " ").trim(),
    "I would welcome a short conversation about what the team is looking for, and I have attached my resume in case it is useful.",
    `Thank you for your time.\n${YOUR_NAME}`,
  ].join("\n\n");
  notes.push("Attach your resume yourself. Nothing is attached or sent for you.");
  return { kind, subject: `${job.title} at ${job.company}`, body, notes, ai: false };
}

/** Plain suggestions on how to approach this person, from what is known about them and recorded with them. */
export function suggestApproach(contact: Contact): string[] {
  const prior = priorContact(contact);
  const out: string[] = [];
  if (contact.status === "Possible match") out.push("Check their profile or the company site first. They may not cover this role, or may have moved on.");
  if (contact.cautions.some((c) => /senior HR leader/i.test(c))) out.push("A senior HR leader is unlikely to handle one posting. Look for the recruiter or the hiring manager first.");
  if (contact.businessEmail && contact.sources.some((s) => s.type === "job posting")) out.push("The posting itself lists this contact, so a short email is appropriate.");
  if (contact.linkedinUrl && !prior.requested && !prior.connected) out.push("Send a short connection request that names the role. Keep it brief and specific.");
  if (prior.requested && !prior.connected && !prior.messaged) out.push("Wait about a week for the request to be accepted before following up.");
  if (prior.connected && !prior.messaged) out.push("You are connected. Send a short message about the role and ask one clear question.");
  if (prior.messaged && !prior.replied) out.push("A single polite follow-up after about a week is reasonable. Do not send more than one or two.");
  if (prior.replied) out.push("They replied. Keep the conversation going, and thank them.");
  if (!out.length) out.push("Start with a short, specific message that names the role and one relevant strength.");
  return out;
}

/* ---------- checking an AI-written draft ---------- */

const CLAIMS_OF_CONTACT = /\b(?:as we discussed|as discussed|following up on our (?:call|conversation|chat|meeting)|thank(?:s| you) for (?:speaking|chatting|talking|meeting|your time (?:last|on|yesterday))|great (?:speaking|talking|chatting)|as promised|when we (?:spoke|met|talked)|our (?:previous|last|earlier) (?:conversation|call|meeting|chat)|(?:I|we) (?:spoke|talked|met|chatted) (?:with you|last|on|earlier))\b/i;
const CLAIM_APPLIED = /\b(?:I(?:'ve| have)? (?:already )?applied|my application|I submitted)\b/i;
const CLAIM_REQUEST = /\b(?:I sent (?:you )?a connection request|my connection request|my earlier (?:message|email|request))\b/i;

export function draftIsSafe(
  text: string,
  ctx: { contact: Pick<Contact, "activities">; profile: CandidateProfile | null; resumeText: string; job: DraftJob; appliedAt: string | null },
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const prior = priorContact(ctx.contact as Contact);
  const inTouch = prior.requested || prior.messaged || prior.replied || prior.connected;
  if (CLAIMS_OF_CONTACT.test(text) && !prior.replied && !prior.messaged) reasons.push("It claims you have spoken before, and no conversation is recorded.");
  if (CLAIM_REQUEST.test(text) && !prior.requested && !prior.messaged) reasons.push("It mentions an earlier request or message that is not recorded.");
  if (/\bfollow(?:ing)? up\b/i.test(text) && !inTouch && /\b(?:again|earlier|previous)\b/i.test(text)) reasons.push("It treats this as a follow-up, and no earlier contact is recorded.");
  if (CLAIM_APPLIED.test(text) && !ctx.appliedAt) reasons.push("It says you applied, and no application is recorded.");

  // Numbers (years, counts) must come from the resume or the posting. Dates written by this app are allowed.
  const sources = `${ctx.resumeText}\n${ctx.job.description}\n${ctx.job.title}`;
  for (const n of text.match(/\d[\d,.]*/g) ?? []) {
    const bare = n.replace(/[,.]+$/, "");
    if (!sources.includes(bare) && !(ctx.appliedAt ?? "").includes(bare) && !/^\d{4}-\d{2}-\d{2}$/.test(bare) && !prior.lastDate?.includes(bare)) reasons.push(`It uses the number ${bare}, which is not on your resume or in the posting.`);
  }

  // Skills must be ones you have, or ones the posting asks for (interest in a skill is fine; claiming it is checked below).
  const mine = new Set((ctx.profile ? profileSkills(ctx.profile.skills) : []).map((s) => s.toLowerCase()));
  const asked = new Set([...parseRequirements(ctx.job.title, ctx.job.description).required, ...parseRequirements(ctx.job.title, ctx.job.description).preferred].map((s) => canonicalSkill(s).toLowerCase()));
  for (const s of flattenSkills(extractSkills(text)).map(canonicalSkill)) {
    if (!mine.has(s.toLowerCase()) && !asked.has(s.toLowerCase())) reasons.push(`It mentions ${s}, which is neither on your resume nor in the posting.`);
  }
  // A skill the posting wants but your resume lacks must not be claimed as yours.
  for (const s of flattenSkills(extractSkills(text)).map(canonicalSkill)) {
    if (!mine.has(s.toLowerCase()) && new RegExp(`\\b(?:I|my|I've|I have)\\b[^.]{0,80}${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text)) reasons.push(`It says you have ${s}, which is not on your resume.`);
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
