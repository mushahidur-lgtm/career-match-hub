import { z } from "zod";
import { stashUnreadable } from "@/lib/storage";
import {
  ACTIVITY_TYPES,
  CONTACT_LIMITS as L,
  CONTACT_TYPES,
  NETWORK_STAGES,
  SOURCE_TYPES,
  type Contact,
  type ContactsStore,
  type FindRecord,
} from "@/types/contacts";

const str = (max: number) => z.string().max(max);
const day = z.string().max(10);

const SourceSchema = z.object({ id: str(80), url: str(L.url), type: z.enum(SOURCE_TYPES), evidence: str(L.evidence), discoveredAt: str(40) });
const JobLinkSchema = z.object({ jobKey: str(500), jobTitle: str(200), company: str(L.company), relationship: z.enum(CONTACT_TYPES), relevance: z.number().min(0).max(100) });
const ActivitySchema = z.object({ id: str(80), type: z.enum(ACTIVITY_TYPES), date: day, jobKey: str(500).nullable(), notes: str(L.activityNotes), nextFollowUp: day.nullable() });

export const ContactSchema = z.object({
  id: str(80),
  name: str(L.name),
  title: str(L.title),
  company: str(L.company),
  department: str(L.department),
  linkedinUrl: str(L.url).nullable(),
  bioQuote: z.object({ text: str(L.bio), url: str(L.url) }).nullable(),
  businessEmail: str(L.email).nullable(),
  businessPhone: str(L.phone).nullable(),
  type: z.enum(CONTACT_TYPES),
  status: z.enum(["Verified", "Likely match", "Possible match"]),
  confidence: z.number().min(0).max(100),
  lastVerifiedAt: day,
  sources: z.array(SourceSchema).max(L.sourcesMax),
  jobs: z.array(JobLinkSchema).max(L.jobsMax),
  origin: z.enum(["found", "manual"]),
  aiNote: str(L.aiNote).nullable(),
  cautions: z.array(str(L.caution)).max(5),
  stage: z.enum(NETWORK_STAGES),
  notes: str(L.notes),
  activities: z.array(ActivitySchema).max(L.activitiesMax),
  applicationJobIds: z.array(str(200)).max(50),
  nextFollowUp: day.nullable(),
  createdAt: str(40),
  updatedAt: str(40),
});

export const FindRecordSchema = z.object({
  id: str(80),
  jobKey: str(500),
  jobTitle: str(200),
  company: str(L.company),
  location: str(200),
  at: str(40),
  searched: z.object({ posting: z.boolean(), web: z.boolean() }),
  candidates: z.array(ContactSchema).max(L.candidatesMax),
  note: str(500).nullable(),
});

/**
 * Reads the stored contacts one entry at a time, so one damaged entry never hides the rest.
 * Entries that cannot be read are returned for setting aside, not thrown away.
 */
export function readContacts(value: unknown): { store: ContactsStore; rejected: unknown[] } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as { contacts?: unknown; deletedIds?: unknown; finds?: unknown };
  if (!Array.isArray(v.contacts)) return undefined;
  const rejected: unknown[] = [];
  const contacts: Contact[] = [];
  const ids = new Set<string>();
  for (const e of v.contacts) {
    const r = ContactSchema.safeParse(e);
    if (!r.success || ids.has(r.data.id)) {
      rejected.push(e);
      continue;
    }
    ids.add(r.data.id);
    contacts.push(r.data as Contact);
  }
  const finds: FindRecord[] = [];
  for (const e of Array.isArray(v.finds) ? v.finds : []) {
    const r = FindRecordSchema.safeParse(e);
    if (r.success) finds.push(r.data as FindRecord);
    else rejected.push(e);
  }
  const deletedIds = (Array.isArray(v.deletedIds) ? v.deletedIds : []).filter((x): x is string => typeof x === "string" && x.length <= 80).slice(-L.deletedMax);
  return { store: { contacts, deletedIds, finds }, rejected };
}

export function stashContacts(entries: unknown[]): void {
  try {
    stashUnreadable(window.localStorage, `cmh:contacts:entries:${Date.now()}`, JSON.stringify(entries));
  } catch {
    /* storage unavailable */
  }
}
