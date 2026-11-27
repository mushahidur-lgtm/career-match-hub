import { describe, expect, it } from "vitest";
import { buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { restoreContactDetails, withoutContactDetails } from "@/lib/cloud/redact";
import { forCloud, mergeAppData } from "@/lib/cloud/sync";
import { heuristicProfile } from "@/lib/heuristics";
import { recordSearch, EMPTY_INTEL } from "@/lib/history";
import { scoreJob } from "@/lib/matching/engine";
import { recordFeedback } from "@/lib/feedback";
import { addSavedJob, setSavedNotes, setSavedStatus } from "@/lib/saved";
import { toMatchInput } from "@/lib/search/match-input";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, type Job } from "@/types/job";

// Invented. The details are put on ordinary resume lines, the way they turn up outside the header.
const EMAIL = "jordan.lee@mail.example";
const PHONE = "416-555-0123";
const CONTACT = new RegExp(`${EMAIL.replace(".", "\\.")}|${PHONE}`);
const TEXT = `Jordan Lee
${EMAIL} | ${PHONE}

Summary
Data engineer. Reach me at ${EMAIL}.

Experience
Data Engineer, Northwind, 2019 - 2023
- Built ETL pipelines in Python and SQL on Azure Data Factory, support line ${PHONE}.

Education
BSc, Example University, ${PHONE}, 2015

Certifications
Azure Data Engineer DP-203, verify at ${EMAIL}

Skills
Python, SQL, Azure Data Factory`;

/** Data made by the app's own functions, so every place it copies resume lines to is filled. */
function appData(): AppData {
  const profile = heuristicProfile(TEXT);
  const resume = { id: "r1", name: `CV ${PHONE}`, text: TEXT, fileName: `${EMAIL}.pdf`, uploadedAt: "2026-11-26T00:00:00.000Z", profile };
  const base: Job = {
    id: "job-1",
    title: "Data Engineer",
    company: "Contoso",
    location: "Toronto, ON",
    workMode: "Hybrid",
    employmentType: "Full-time",
    category: "Data and analytics",
    salary: null,
    postedAt: "2026-11-20T00:00:00.000Z",
    description: "Build ETL pipelines in Python and SQL on Azure Data Factory. Questions: hiring@contoso.example",
    descriptionTruncated: false,
    applyUrl: "https://careers.contoso.example/1",
    source: "adzuna",
    match: null,
  };
  const job = { ...base, match: scoreJob(base, toMatchInput(profile, TEXT, DEFAULT_PREFERENCES)) };
  const ref = { id: resume.id, name: resume.name };
  let saved = addSavedJob([], job, "Interested", new Date("2026-11-26T11:00:00Z"), ref);
  // Moving to Applied is what records the resume, both on the application and in its history.
  saved = setSavedStatus(saved, job.id, "Applied", new Date("2026-11-26T12:00:00Z"), { resume: ref });
  saved = setSavedNotes(saved, job.id, `Call recruiter on ${PHONE}`);
  saved = saved.map((s) => ({ ...s, coverLetter: `Reach me at ${EMAIL}` }));
  const intel = recordSearch(EMPTY_INTEL, { at: "2026-11-26T12:00:00.000Z", filters: DEFAULT_FILTERS, response: { jobs: [job], provider: "adzuna", scoring: "heuristic" }, resume });
  const feedback = recordFeedback(recordFeedback([], "application_submitted", job), "skill_match_corrected", job, "Python");
  return { resumes: [resume], activeResumeId: "r1", filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved, intel, feedback };
}

describe("the cloud copy", () => {
  const local = appData();
  const before = structuredClone(local);
  const sent = forCloud(local);

  it("is filled with the details before they are removed", () => {
    expect(local.resumes[0].profile.certifications?.join()).toMatch(CONTACT);
    expect(JSON.stringify(local.saved[0].job.match)).toMatch(CONTACT);
    expect(local.saved[0].resumeName).toMatch(CONTACT);
    expect(local.intel!.history[0].resumeName).toMatch(CONTACT);
  });

  it("has no contact details anywhere, apart from what you typed and the posting itself", () => {
    expect(local.saved[0].history?.some((h) => h.text.startsWith("Resume used: ") && CONTACT.test(h.text))).toBe(true);
    // The whole upload, with only the deliberate exceptions blanked. A new place that copies resume text fails here.
    const rest = structuredClone(sent);
    for (const s of rest.saved) {
      expect(s.notes).toContain(PHONE);
      s.notes = "";
      s.coverLetter = "";
      s.job.description = "";
    }
    delete rest.contacts;
    expect(JSON.stringify(rest)).not.toMatch(CONTACT);
  });

  it("keeps what you typed yourself, and the posting", () => {
    expect(sent.saved[0].notes).toContain(PHONE);
    expect(sent.saved[0].coverLetter).toContain(EMAIL);
    expect(sent.saved[0].job.description).toContain("hiring@contoso.example");
  });

  it("leaves this device's data alone", () => {
    expect(local).toEqual(before);
  });

  it("can still be read back by the app", () => {
    const read = parseBackup(buildBackup(sent));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data.resumes).toHaveLength(1);
  });

  it("keeps dates and amounts", () => {
    const line = "Data Engineer, Acme, 2019 - 2023. Cut costs from 1,250,000 to 900,000.";
    expect(withoutContactDetails(line)).toBe(line);
  });

  it("never makes a value longer", () => {
    for (const value of ["a@b.co", `x ${PHONE} y`, "+44 20 7946 0958", "linkedin.com/in/a", EMAIL]) expect(withoutContactDetails(value).length).toBeLessThanOrEqual(value.length);
  });

  it("gives this device its details back on a pull and on a merge", () => {
    const read = parseBackup(buildBackup(sent));
    if (!read.ok) throw new Error(read.error);
    const here = parseBackup(buildBackup(local));
    if (!here.ok) throw new Error(here.error);
    const pulled = restoreContactDetails(here.data, read.data);
    expect(pulled.resumes).toEqual(here.data.resumes);
    expect(pulled.saved).toEqual(here.data.saved);
    expect(pulled.intel!.history).toEqual(here.data.intel!.history);

    // Another device touched the application later, so its copy of it wins the merge.
    const newer = { ...read.data, saved: read.data.saved.map((s) => ({ ...s, notes: "edited elsewhere", updatedAt: "2099-01-01T00:00:00.000Z" })) };
    const merged = mergeAppData(here.data, restoreContactDetails(here.data, newer));
    expect(merged.saved[0].notes).toBe("edited elsewhere");
    expect(merged.saved[0].resumeName).toBe(here.data.saved[0].resumeName);
    expect(merged.saved[0].job.match).toEqual(here.data.saved[0].job.match);
  });

  it("does not add the same resume twice when it was uploaded on two devices", () => {
    const other = { ...sent, resumes: [{ ...sent.resumes[0], id: "added-on-another-device" }] };
    expect(mergeAppData(local, other).resumes).toEqual(local.resumes);
    const different = { ...sent, resumes: [{ ...sent.resumes[0], id: "r2", text: "Another resume altogether." }] };
    expect(mergeAppData(local, different).resumes).toHaveLength(2);
  });

  it("does not undo a change made on another device", () => {
    const edited = { ...sent, resumes: [{ ...sent.resumes[0], text: "A newer version from another device.", profile: { ...sent.resumes[0].profile, certifications: ["PL-300"] } }] };
    const pulled = restoreContactDetails(local, edited);
    expect(pulled.resumes[0].text).toBe("A newer version from another device.");
    expect(pulled.resumes[0].profile.certifications).toEqual(["PL-300"]);
  });
});
