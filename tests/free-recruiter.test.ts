import { describe, expect, it } from "vitest";
import { diagnoseNoResult } from "@/lib/contacts/diagnostics";
import { analyzePosting, contactsFromPosting, findNamesInPosting } from "@/lib/contacts/extract";
import { bingSearch, researchLinks } from "@/lib/contacts/links";
import { contactsForJob, linkJob, mergeContactStores, newContact, possibleDuplicates, sameContact, saveContact, unlinkJob, updateContact } from "@/lib/contacts/model";
import { mergeDuplicates } from "@/lib/dedupe";
import { applyLinkInfo, descriptionInfo, likelyClosed } from "@/lib/job-quality";
import { DEFAULT_REFINE, refineJobs } from "@/lib/refine";
import { EMPTY_CONTACTS, type JobLink } from "@/types/contacts";
import { jobKey } from "@/lib/backup";
import { makeJob } from "./helpers";

const now = new Date(2026, 10, 22, 12);
const posting = (description: string, over = {}) => makeJob({ company: "Acme Analytics", description, ...over });

/* ---------- reading names, emails and phones the posting prints ---------- */

describe("people a posting names, in varied wording", () => {
  it("reads a recruiter with a middle initial, a business email and a phone on the same line", () => {
    const [h] = findNamesInPosting("Recruiter: Jane A. Smith | jane.smith@acme.example | (613) 555-0142 | Ottawa", "Acme Analytics");
    expect(h).toMatchObject({ name: "Jane A. Smith", title: "Recruiter", email: "jane.smith@acme.example", phone: "(613) 555-0142", kind: "recruiting" });
    expect(h.cautions).toEqual([]);
  });

  it("reads 'Contact Name, Title' with a phone and email in the sentence", () => {
    const [h] = findNamesInPosting("Questions? Contact Priya Nair, Senior Talent Acquisition Partner at 613-555-0100 or priya.nair@acme.example.", "Acme Analytics");
    expect(h).toMatchObject({ name: "Priya Nair", email: "priya.nair@acme.example", phone: "613-555-0100" });
    expect(h.title).toMatch(/Talent Acquisition Partner/);
  });

  it("drops honorifics and handles Mc and O' names", () => {
    expect(findNamesInPosting("Recruiter: Ms. Jane Smith")[0].name).toBe("Jane Smith");
    expect(findNamesInPosting("Recruiter: Ian McDonald")[0].name).toBe("Ian McDonald");
    expect(findNamesInPosting("Hiring Manager - Liam O'Brien")[0].name).toBe("Liam O'Brien");
  });

  it("reads other recruiting titles", () => {
    expect(findNamesInPosting("Recruitment Coordinator: Aisha Khan")[0]).toMatchObject({ name: "Aisha Khan", kind: "recruiting" });
    expect(findNamesInPosting("People & Culture Partner - Noah Fraser")[0]).toMatchObject({ name: "Noah Fraser" });
    expect(findNamesInPosting("Reach out to Mei Chen (HR Business Partner) for questions.")[0]).toMatchObject({ name: "Mei Chen" });
  });

  it("reads the person a role reports to, as a likely hiring manager rather than a certain one", () => {
    const [h] = findNamesInPosting("Reports to: Maria Lopez, Director of Data Engineering");
    expect(h).toMatchObject({ name: "Maria Lopez", kind: "reports", type: "Hiring Manager", title: "Director of Data Engineering" });
    expect(h.cautions[0]).toMatch(/reports to/i);
    const [c] = contactsFromPosting(posting("Reports to: Maria Lopez, Director of Data Engineering"), now);
    expect(c.type).toBe("Hiring Manager");
    expect(c.status).toBe("Likely match");
  });

  it("reads a department leader as a department head who is not tied to this one posting", () => {
    const [c] = contactsFromPosting(posting("Our team is led by Sam Okafor, Head of Analytics."), now);
    expect(c).toMatchObject({ name: "Sam Okafor", type: "Department Head" });
    expect(c.status).toBe("Likely match");
    expect(c.jobs[0].jobSpecific).toBe(false);
  });

  it("keeps the email and phone with the contact and the sentence as the source", () => {
    const [c] = contactsFromPosting(posting("Recruiter: Jane Smith, jane.smith@acme.example, 613-555-0142", { applyUrl: "https://careers.acme.example/job/1" }), now);
    expect(c).toMatchObject({ name: "Jane Smith", businessEmail: "jane.smith@acme.example", businessPhone: "613-555-0142", status: "Verified", type: "Recruiter" });
    expect(c.sources[0]).toMatchObject({ type: "job posting", url: "https://careers.acme.example/job/1" });
    expect(c.sources[0].evidence).toContain("Recruiter: Jane Smith");
  });

  it("gives each person their own email when two people share a line", () => {
    const hits = findNamesInPosting("Recruiter: Jane Smith jane.smith@acme.example; Hiring Manager: Luc Tremblay luc.tremblay@acme.example");
    expect(hits.map((h) => [h.name, h.email])).toEqual([
      ["Jane Smith", "jane.smith@acme.example"],
      ["Luc Tremblay", "luc.tremblay@acme.example"],
    ]);
  });

  it("gives a detail to the name before it, not to a name that starts right after it", () => {
    const hits = findNamesInPosting("Recruiter: Jane A. Smith | jane.smith@acme.example | (613) 555-0142. Reports to: Maria Lopez, Director of Data Engineering.", "Acme Analytics");
    expect(hits.map((h) => [h.name, h.email, h.phone])).toEqual([
      ["Jane A. Smith", "jane.smith@acme.example", "(613) 555-0142"],
      ["Maria Lopez", null, null],
    ]);
  });

  it("uses a detail printed before the only name on the line", () => {
    const [h] = findNamesInPosting("Email jane.smith@acme.example (Jane Smith, Recruiter)", "Acme Analytics");
    expect(h).toMatchObject({ name: "Jane Smith", email: "jane.smith@acme.example" });
  });

  it("marks a mailbox printed beside a name as possibly shared", () => {
    const [h] = findNamesInPosting("Recruiter: Jane Smith (careers@acme.example)");
    expect(h.email).toBe("careers@acme.example");
    expect(h.cautions.join(" ")).toMatch(/shared mailbox/);
  });

  it("never attaches an email from another line, or a personal mailbox", () => {
    const a = analyzePosting("Recruiter: Jane Smith\nEmail: careers@acme.example", "Acme Analytics");
    expect(a.hits[0].email).toBeNull();
    expect(a.shared.emails).toEqual(["careers@acme.example"]);
    const b = analyzePosting("Recruiter: Jane Smith, jane.smith@gmail.com", "Acme Analytics");
    expect(b.hits[0].email).toBeNull();
    expect(b.shared.emails).toEqual([]);
  });

  it("never builds an email, a profile address or a name that the posting does not print", () => {
    const [c] = contactsFromPosting(posting("Recruiter: Jane Smith"), now);
    expect(c.businessEmail).toBeNull();
    expect(c.businessPhone).toBeNull();
    expect(c.linkedinUrl).toBeNull();
    expect(contactsFromPosting(posting("Email careers@acme.example to apply."), now)).toEqual([]);
  });
});

describe("text that looks like a contact but is not", () => {
  it.each([
    "Talent Acquisition Team: Apply Now",
    "Contact: Human Resources",
    "Contact: Acme Analytics",
    "Job Description, Recruiter",
    "Senior Software Engineer - Human Resources Systems",
    "Reports to Senior Manager, Engineering",
    "Reports to: Hiring Manager - Data Engineering",
    "Recruiter: Power Platform",
    "Hiring Manager: Data Platform",
    "Recruiter: Apply Now",
    "Recruiter - Remote Canada",
    "Equal Opportunity Employer. Talent Acquisition Partner: Please Contact Us",
    "Human Resources Manager Needed",
    "We are the recruiter of choice for Canadian analytics talent.",
    "Our Chief Executive Officer, Jane Smith, founded the firm.",
  ])("finds no person in %j", (text) => {
    expect(findNamesInPosting(text, "Acme Analytics")).toEqual([]);
  });

  it("does not read a phone-looking job number or a salary as a phone", () => {
    const a = analyzePosting("Recruiter: Jane Smith. Salary $120,000-$150,000. Job ID 1234567890.", "Acme Analytics");
    expect(a.hits[0].phone).toBeNull();
    expect(a.shared.phones).toEqual([]);
  });

  it("treats a bare mailbox and switchboard as shared, not as a person", () => {
    const a = analyzePosting("Questions: hr@acme.example or call 613-555-0100.", "Acme Analytics");
    expect(a.hits).toEqual([]);
    expect(a.shared).toEqual({ emails: ["hr@acme.example"], phones: ["613-555-0100"] });
  });
});

/* ---------- free research links ---------- */

describe("free research links", () => {
  const groups = researchLinks({ company: "Acme Analytics Inc.", title: "Senior Data Engineer", category: "Data and analytics", location: "Ottawa, ON", description: "Build pipelines." });

  it("covers recruiter, talent acquisition, hiring manager, department and the careers page", () => {
    expect(groups.map((g) => g.id)).toEqual(["recruiter", "talent", "manager", "department", "careers"]);
  });

  it("names the company and role in the search, on Google and Bing, plus LinkedIn as a link to open yourself", () => {
    const recruiter = groups.find((g) => g.id === "recruiter")!;
    expect(recruiter.links.map((l) => l.engine)).toEqual(["Google", "Bing", "LinkedIn"]);
    expect(decodeURIComponent(recruiter.links[0].href)).toContain('"Acme Analytics Inc." recruiter "Senior Data Engineer"');
    expect(recruiter.links[1].href.startsWith("https://www.bing.com/search?q=")).toBe(true);
    expect(recruiter.links[2].href.startsWith("https://www.linkedin.com/search/results/people/?keywords=")).toBe(true);
  });

  it("adds a department-specific search and a careers page search", () => {
    const dept = groups.find((g) => g.id === "department")!;
    expect(dept.title).toMatch(/Data|Analytics|Engineering/);
    const careers = groups.find((g) => g.id === "careers")!;
    expect(careers.links.some((l) => decodeURIComponent(l.href).includes('"Acme Analytics Inc." careers'))).toBe(true);
  });

  it("only ever links to search pages, never to a profile address", () => {
    for (const l of groups.flatMap((g) => g.links)) {
      const u = new URL(l.href);
      expect(["www.google.com", "www.bing.com", "www.linkedin.com"]).toContain(u.hostname);
      expect(u.pathname).toMatch(/^\/(search|search\/results\/people\/)$/);
    }
  });

  it("returns nothing when the employer is unknown, and strips quotes that would change the search", () => {
    expect(researchLinks({ company: "Company not listed", title: "Data Engineer" })).toEqual([]);
    expect(researchLinks({ company: "   ", title: "Data Engineer" })).toEqual([]);
    const q = researchLinks({ company: 'Ac"me', title: "Dev" })[0].links[0].query;
    expect(q).toBe('"Ac me" recruiter "Dev"');
    expect(bingSearch("a b")).toBe("https://www.bing.com/search?q=a%20b");
  });
});

/* ---------- no-result diagnostics ---------- */

describe("no-result diagnostics", () => {
  const base = { company: "Acme Analytics", description: "x".repeat(900), descriptionTruncated: false, applyUrl: "https://careers.acme.example/j/1", source: "adzuna" as const };

  it("says a truncated description may hide a contact, and offers the full posting", () => {
    const d = diagnoseNoResult({ ...base, description: "y".repeat(500), descriptionTruncated: true }, { webSearchRan: false });
    expect(d.reasons.join(" ")).toMatch(/only the start/);
    expect(d.reasons.join(" ")).toMatch(/500 characters/);
    expect(d.next).toMatch(/Open the full posting/);
    expect(d.inspectUrl).toBe(base.applyUrl);
  });

  it("says when the employer is missing, before anything else", () => {
    const d = diagnoseNoResult({ ...base, company: "Company not listed" }, { webSearchRan: false });
    expect(d.reasons[0]).toMatch(/does not name the employer/);
    expect(d.next).toMatch(/employer's name/);
  });

  it("says when no person was named, and what was and was not checked", () => {
    const free = diagnoseNoResult(base, { webSearchRan: false });
    expect(free.reasons.join(" ")).toMatch(/names no recruiter/);
    expect(free.checked.join(" ")).toMatch(/job posting text/);
    expect(free.checked.join(" ")).toMatch(/No web search was run/);
    expect(free.next).toMatch(/searches below/);
    expect(free.inspectUrl).toBeNull();
    const web = diagnoseNoResult(base, { webSearchRan: true });
    expect(web.checked.join(" ")).toMatch(/A web search/);
    expect(web.checked.join(" ")).not.toMatch(/No web search was run/);
  });

  it("reports a shared mailbox as a mailbox, not a person", () => {
    const d = diagnoseNoResult({ ...base, description: `${"x".repeat(500)} Send questions to careers@acme.example.` }, { webSearchRan: false });
    expect(d.shared.emails).toEqual(["careers@acme.example"]);
    expect(d.reasons.join(" ")).toMatch(/mailbox or switchboard, not a named person/);
  });

  it("points to the careers page when the listing has no apply link", () => {
    const d = diagnoseNoResult({ ...base, applyUrl: null, descriptionTruncated: true }, { webSearchRan: false });
    expect(d.inspectUrl).toBeNull();
    expect(d.next).toMatch(/careers page/);
  });
});

/* ---------- listing quality ---------- */

describe("job listing quality", () => {
  it("tells partial, short and full descriptions apart", () => {
    expect(descriptionInfo({ description: "a".repeat(500), descriptionTruncated: true })).toMatchObject({ level: "partial", label: "Partial description" });
    expect(descriptionInfo({ description: "Short.", descriptionTruncated: false }).level).toBe("short");
    expect(descriptionInfo({ description: "a".repeat(2000), descriptionTruncated: false })).toMatchObject({ level: "full", note: null });
  });

  it("classifies where the apply link goes", () => {
    const kind = (applyUrl: string | null, company = "Acme Analytics") => applyLinkInfo({ applyUrl, company, source: "adzuna" }).kind;
    expect(kind(null)).toBe("none");
    expect(kind("javascript:alert(1)")).toBe("none");
    expect(kind("https://www.adzuna.ca/land/ad/123")).toBe("redirect");
    expect(kind("https://ca.indeed.com/viewjob?jk=1")).toBe("job-board");
    expect(kind("https://boards.greenhouse.io/acme/jobs/1")).toBe("tracking-system");
    expect(kind("https://careers.acme.example/jobs/1")).toBe("employer");
    expect(kind("https://random.example/x")).toBe("unknown");
    expect(applyLinkInfo({ applyUrl: "https://www.adzuna.ca/land/ad/1", company: "Acme", source: "adzuna" }).direct).toBe(false);
    expect(applyLinkInfo({ applyUrl: "https://careers.acme.example/1", company: "Acme", source: "adzuna" }).direct).toBe(true);
  });

  it("flags a posting as likely closed by age or by its own words, and gives the reason", () => {
    const old = likelyClosed({ postedAt: "2026-09-01T00:00:00Z", description: "Great role." }, now);
    expect(old.closed).toBe(true);
    expect(old.reasons[0]).toMatch(/days ago/);
    const text = likelyClosed({ postedAt: "2026-11-20T00:00:00Z", description: "Update: this position has been filled." }, now);
    expect(text.closed).toBe(true);
    expect(text.reasons[0]).toMatch(/closed or no longer accepting/);
    expect(likelyClosed({ postedAt: "2026-11-20T00:00:00Z", description: "Build pipelines." }, now).closed).toBe(false);
    expect(likelyClosed({ postedAt: null, description: "Build pipelines." }, now).closed).toBe(false);
  });

  it("hides likely closed jobs in one step, including those that say so in their text", () => {
    const fresh = makeJob({ id: "a", postedAt: "2026-11-20T00:00:00Z", description: "Build pipelines." });
    const old = makeJob({ id: "b", postedAt: "2026-09-01T00:00:00Z" });
    const said = makeJob({ id: "c", postedAt: "2026-11-20T00:00:00Z", description: "This job has expired." });
    const out = refineJobs([fresh, old, said], { ...DEFAULT_REFINE, hideStale: true }, { statusOf: () => null, now });
    expect(out.map((j) => j.id)).toEqual(["a"]);
    expect(refineJobs([fresh, old, said], DEFAULT_REFINE, { statusOf: () => null, now })).toHaveLength(3);
  });

  it("prefers a complete description over a truncated one for the same job, without rewriting either", () => {
    const adzuna = makeJob({ id: "a1", source: "adzuna", description: "a".repeat(500), descriptionTruncated: true, applyUrl: "https://www.adzuna.ca/land/ad/1" });
    const full = "Full posting text. ".repeat(100);
    const jsearch = makeJob({ id: "j1", source: "jsearch", description: full, descriptionTruncated: false, salary: null, applyUrl: "https://careers.acme.example/1" });
    const [merged] = mergeDuplicates([adzuna, jsearch]);
    expect(merged.source).toBe("adzuna");
    expect(merged.description).toBe(full);
    expect(merged.descriptionTruncated).toBe(false);
    expect(merged.duplicateCount).toBe(1);
    expect(merged.otherApplyUrls).toEqual(["https://careers.acme.example/1"]);
  });

  it("leaves the kept description alone when it is already complete", () => {
    const a = makeJob({ id: "a1", description: "a".repeat(1500), descriptionTruncated: false });
    const b = makeJob({ id: "j1", source: "jsearch", description: "b".repeat(3000), descriptionTruncated: false, salary: null });
    const [merged] = mergeDuplicates([a, b]);
    expect(merged.description).toBe("a".repeat(1500));
  });
});

/* ---------- duplicate contacts and contacts reused across jobs ---------- */

const li = "https://www.linkedin.com/in/jane-smith-123";
const jane = (over = {}) => newContact({ name: "Jane Smith", company: "Acme Analytics", title: "Recruiter", ...over }, now);
const linkFor = (j: ReturnType<typeof makeJob>, over: Partial<JobLink> = {}): JobLink => ({ jobKey: jobKey(j), jobTitle: j.title, company: j.company, location: j.location, relationship: "Recruiter", relevance: 50, ...over });

describe("duplicate detection across name, company and profile address", () => {
  it("is the same person when one has a profile address and the other has none", () => {
    expect(sameContact(jane({ linkedinUrl: li }), jane())).toBe(true);
    expect(sameContact(jane(), jane({ linkedinUrl: li }))).toBe(true);
  });

  it("is the same person when the profile address matches, even if the name is written differently", () => {
    expect(sameContact(jane({ linkedinUrl: li }), jane({ name: "Dr. Jane  Smith", linkedinUrl: `${li}/?trk=x` }))).toBe(true);
    expect(sameContact(jane({ linkedinUrl: li }), jane({ name: "J. Smith", linkedinUrl: li }))).toBe(true);
  });

  it("is two people when both have profile addresses and they differ, even with the same name and employer", () => {
    expect(sameContact(jane({ linkedinUrl: li }), jane({ linkedinUrl: "https://www.linkedin.com/in/jane-smith-999" }))).toBe(false);
  });

  it("is two people at different employers, and ignores accents, case and company suffixes", () => {
    expect(sameContact(jane(), jane({ company: "Globex" }))).toBe(false);
    expect(sameContact(jane({ name: "José Núñez", company: "Acme Analytics Inc." }), jane({ name: "jose nunez", company: "ACME Analytics" }))).toBe(true);
  });

  it("adds new evidence to the saved person instead of saving a second copy", () => {
    const first = saveContact(EMPTY_CONTACTS, jane({ linkedinUrl: li, notes: "Met at a meetup" }), now);
    const again = saveContact(first.store, jane({ title: "" }), now);
    expect(again.merged).toBe(true);
    expect(again.store.contacts).toHaveLength(1);
    expect(again.store.contacts[0].notes).toBe("Met at a meetup");
    expect(again.store.contacts[0].linkedinUrl).toBe(li);
  });

  it("flags, but does not merge, a similar name at the same employer", () => {
    const a = jane();
    const b = jane({ name: "Jacob Smith" });
    expect(sameContact(a, b)).toBe(false);
    expect(possibleDuplicates([a], b)).toHaveLength(1);
  });

  it("combines two stores into one entry per person, whichever has the profile address", () => {
    const a = { ...EMPTY_CONTACTS, contacts: [jane({ linkedinUrl: li })] };
    const b = { ...EMPTY_CONTACTS, contacts: [jane({ id: "other-id" })] };
    expect(mergeContactStores(a, b).contacts).toHaveLength(1);
  });
});

describe("one saved contact used for several jobs", () => {
  const job1 = makeJob({ id: "j1", title: "Data Engineer", company: "Acme Analytics" });
  const job2 = makeJob({ id: "j2", title: "BI Developer", company: "Acme Analytics" });

  it("relates the person to a second job without changing notes, status, follow-up or history", () => {
    const start = saveContact(EMPTY_CONTACTS, jane({ origin: "manual", notes: "Referral from Sam", stage: "Connected", nextFollowUp: "2026-12-01", jobs: [linkFor(job1)] }), now);
    const id = start.contact.id;
    const next = linkJob(start.store, id, linkFor(job2, { jobSpecific: false }), now);
    const c = next.contacts[0];
    expect(c.jobs.map((j) => j.jobTitle).sort()).toEqual(["BI Developer", "Data Engineer"]);
    expect(c).toMatchObject({ notes: "Referral from Sam", stage: "Connected", nextFollowUp: "2026-12-01" });
    expect(contactsForJob(next, jobKey(job1)).map((x) => x.id)).toEqual([id]);
    expect(contactsForJob(next, jobKey(job2)).map((x) => x.id)).toEqual([id]);
  });

  it("does not link the same job twice, and unlinking keeps the person and their notes", () => {
    const start = saveContact(EMPTY_CONTACTS, jane({ notes: "keep", jobs: [linkFor(job1)] }), now);
    const id = start.contact.id;
    const twice = linkJob(linkJob(start.store, id, linkFor(job2), now), id, linkFor(job2), now);
    expect(twice.contacts[0].jobs).toHaveLength(2);
    const removed = unlinkJob(twice, id, jobKey(job1), now);
    expect(removed.contacts[0].jobs.map((j) => j.jobKey)).toEqual([jobKey(job2)]);
    expect(removed.contacts[0].notes).toBe("keep");
    expect(contactsForJob(removed, jobKey(job1))).toEqual([]);
  });

  it("keeps a networking status, follow-up date and notes edited by hand, with a visible source address", () => {
    const start = saveContact(EMPTY_CONTACTS, jane({ origin: "manual", sources: [{ id: "s1", url: "https://acme.example/team", type: "manual", evidence: "Listed on the team page", discoveredAt: now.toISOString() }] }), now);
    const edited = updateContact(start.store, start.contact.id, { stage: "Follow-up", nextFollowUp: "2026-12-05", notes: "Wrote on Nov 20" }, now);
    expect(edited.contacts[0]).toMatchObject({ stage: "Follow-up", nextFollowUp: "2026-12-05", notes: "Wrote on Nov 20" });
    expect(edited.contacts[0].sources[0].url).toBe("https://acme.example/team");
  });
});
