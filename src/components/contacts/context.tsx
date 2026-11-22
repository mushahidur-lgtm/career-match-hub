"use client";

import { createContext, useContext } from "react";
import type { SaveResult } from "@/lib/contacts/model";
import type { Contact, ContactsStore, FindRecord, JobLink, NetworkingActivity } from "@/types/contacts";
import { EMPTY_CONTACTS } from "@/types/contacts";
import type { Application, CandidateProfile, Job } from "@/types/job";

/** What the contact screens need from the rest of the app. Provided once, by the page. */
export interface ContactsApi {
  store: ContactsStore;
  saveCandidate: (c: Contact) => SaveResult;
  addManual: (c: Contact) => SaveResult;
  update: (id: string, patch: Partial<Contact>) => void;
  remove: (id: string) => void;
  verify: (id: string) => void;
  log: (id: string, activity: NetworkingActivity) => void;
  removeActivity: (id: string, activityId: string) => void;
  linkApp: (id: string, jobId: string, link?: JobLink) => void;
  unlinkApp: (id: string, jobId: string) => void;
  /** Relates a saved contact to one more job. */
  linkJob: (id: string, link: JobLink) => void;
  unlinkJob: (id: string, jobKey: string) => void;
  recordFind: (find: FindRecord) => void;
  openFinder: (job: Job) => void;
  openContact: (id: string) => void;
  /** The selected resume's profile and text, for personalising drafts. */
  profile: CandidateProfile | null;
  resumeText: string;
  aiAvailable: boolean;
  /** True when paid web lookups for recruiters are switched on for this site. */
  webSearchAvailable: boolean;
  /** The posting text for a job, from your latest results and applications. Empty when it is not available. */
  descriptionFor: (jobKey: string) => string;
  /** The signed-in session's token when cloud sync is set up, for routes that cost money. */
  getToken: () => Promise<string | null>;
  applications: Application[];
}

const noop = () => undefined;
const emptyResult = (c: Contact): SaveResult => ({ store: EMPTY_CONTACTS, contact: c, merged: false, possibleDuplicates: [], saved: false });

export const ContactsContext = createContext<ContactsApi>({
  store: EMPTY_CONTACTS,
  saveCandidate: emptyResult,
  addManual: emptyResult,
  update: noop,
  remove: noop,
  verify: noop,
  log: noop,
  removeActivity: noop,
  linkApp: noop,
  unlinkApp: noop,
  linkJob: noop,
  unlinkJob: noop,
  recordFind: noop,
  openFinder: noop,
  openContact: noop,
  profile: null,
  resumeText: "",
  aiAvailable: false,
  webSearchAvailable: false,
  descriptionFor: () => "",
  getToken: async () => null,
  applications: [],
});

export const useContacts = () => useContext(ContactsContext);
