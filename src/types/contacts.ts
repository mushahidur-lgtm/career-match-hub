/**
 * HR and recruiter contacts. One Contact holds everything about a person (where we learned of them, which jobs
 * they relate to, and your networking history with them), the same way an Application holds its interviews.
 * Nothing here is ever invented: every contact has at least one source, and unverified details are labelled.
 */

export const CONTACT_TYPES = ["Recruiter", "Talent Acquisition", "HR Manager", "Hiring Manager", "Department Head", "Other"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

/** "Not found" describes a search that found no reliable contact. It is never stored on a contact. */
export const VERIFICATION_STATUSES = ["Verified", "Likely match", "Possible match", "Not found"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ContactStatus = Exclude<VerificationStatus, "Not found">;

export const NETWORK_STAGES = ["Discovered", "Reviewed", "Connection Requested", "Connected", "Conversation", "Follow-up"] as const;
export type NetworkStage = (typeof NETWORK_STAGES)[number];

export const SOURCE_TYPES = ["job posting", "company site", "search result", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface ContactSource {
  id: string;
  url: string;
  type: SourceType;
  /** What the source says, in or close to its own words. Never a guess. */
  evidence: string;
  discoveredAt: string;
}

/** How a contact relates to one job. */
export interface JobLink {
  /** `jobKey` of the posting. */
  jobKey: string;
  jobTitle: string;
  company: string;
  relationship: ContactType;
  /** 0 to 100: how directly this person relates to this job, from the evidence. */
  relevance: number;
}

export const ACTIVITY_TYPES = [
  "Connection request sent",
  "Connection accepted",
  "Message sent",
  "Reply received",
  "Email sent",
  "Call or meeting",
  "Follow-up sent",
  "Note",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface NetworkingActivity {
  id: string;
  type: ActivityType;
  /** "YYYY-MM-DD". */
  date: string;
  jobKey: string | null;
  notes: string;
  nextFollowUp: string | null;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  company: string;
  department: string;
  /** Only ever a profile address that was a public search result. Never built from a name. */
  linkedinUrl: string | null;
  /** A short quote taken from a source, with where it came from. */
  bioQuote: { text: string; url: string } | null;
  /** Only an address or number that appears word for word in a source. */
  businessEmail: string | null;
  businessPhone: string | null;
  type: ContactType;
  status: ContactStatus;
  /** 0 to 98, computed from the evidence by fixed rules (see scoreEvidence). Never reported by the AI. */
  confidence: number;
  /** When the evidence was last checked, "YYYY-MM-DD". */
  lastVerifiedAt: string;
  sources: ContactSource[];
  jobs: JobLink[];
  /** Added by hand, or found by a lookup. */
  origin: "found" | "manual";
  /** A note the AI wrote about why this person matters. An inference, shown as such. */
  aiNote: string | null;
  /** Flags such as "senior HR leader, not tied to this posting". */
  cautions: string[];

  stage: NetworkStage;
  notes: string;
  activities: NetworkingActivity[];
  /** Applications (by job id) this contact is linked to. */
  applicationJobIds: string[];
  nextFollowUp: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A lookup that was run for one job, kept so reopening the job does not search (and pay) again. */
export interface FindRecord {
  id: string;
  jobKey: string;
  jobTitle: string;
  company: string;
  location: string;
  at: string;
  /** What was searched. */
  searched: { posting: boolean; web: boolean };
  /** Contacts the lookup found, not yet saved. Empty means nothing reliable was found. */
  candidates: Contact[];
  /** Why nothing was found or searched, in plain words. */
  note: string | null;
}

export interface ContactsStore {
  contacts: Contact[];
  /** Ids of deleted contacts, so merging with another device never brings one back. */
  deletedIds: string[];
  finds: FindRecord[];
}

export const EMPTY_CONTACTS: ContactsStore = { contacts: [], deletedIds: [], finds: [] };

export const CONTACT_LIMITS = {
  contactsMax: 500,
  deletedMax: 1000,
  findsMax: 60,
  candidatesMax: 8,
  sourcesMax: 12,
  jobsMax: 30,
  activitiesMax: 200,
  name: 120,
  title: 200,
  company: 200,
  department: 200,
  url: 2000,
  evidence: 400,
  bio: 400,
  email: 200,
  phone: 60,
  notes: 5000,
  activityNotes: 2000,
  aiNote: 400,
  caution: 200,
} as const;
