import type { Contact, ContactStatus, ContactType, NetworkStage } from "@/types/contacts";

export interface ContactFilter {
  /** Matches name, title, company, department, the jobs they relate to (title, company, location) and your notes. */
  query: string;
  type: ContactType | "All";
  status: ContactStatus | "All";
  stage: NetworkStage | "All";
}

export const NO_FILTER: ContactFilter = { query: "", type: "All", status: "All", stage: "All" };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterContacts(list: Contact[], f: ContactFilter): Contact[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    if (f.type !== "All" && c.type !== f.type) return false;
    if (f.status !== "All" && c.status !== f.status) return false;
    if (f.stage !== "All" && c.stage !== f.stage) return false;
    if (!words.length) return true;
    const hay = fold([c.name, c.title, c.company, c.department, c.notes, ...c.jobs.flatMap((j) => [j.jobTitle, j.company, j.location ?? ""])].join(" "));
    // Every word must appear somewhere, so "ottawa recruiter" narrows rather than widens.
    return words.every((w) => hay.includes(w));
  });
}

/** Most recently saved first; contacts with a follow-up due come to the top of the order they would otherwise have. */
export const byRecent = (a: Contact, b: Contact) => b.createdAt.localeCompare(a.createdAt);
