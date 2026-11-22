import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ callStructured: vi.fn() }));
const auth = vi.hoisted(() => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/anthropic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anthropic")>("@/lib/anthropic");
  return { ...actual, callStructured: ai.callStructured };
});
vi.mock("@/lib/cloud/auth", () => ({ requireSignedIn: auth.requireSignedIn }));

import { POST } from "@/app/api/networking-draft/route";
import { CONNECTION_NOTE_LIMIT, YOUR_NAME, buildDraft, draftIsSafe, sharedSkills, suggestApproach } from "@/lib/contacts/drafts";
import { googleSearch, linkedinPeopleSearch, mailtoLink, searchLinks, webLink } from "@/lib/contacts/links";
import { logActivity, newActivity, newContact, saveContact } from "@/lib/contacts/model";
import { EMPTY_CONTACTS, type Contact, type ContactsStore } from "@/types/contacts";
import type { CandidateProfile } from "@/types/job";

const now = new Date(2026, 10, 22, 12);
const profile: CandidateProfile = {
  summary: "Data engineer.",
  yearsOfExperience: 9,
  seniority: "Senior",
  skills: { languages: ["Python", "SQL"], frameworks: [], cloudData: ["Azure"], tools: [] },
  detectedRoles: [],
  recommendedRoles: [],
  source: "heuristic",
};
const resumeText = "Senior data engineer with 9 years of experience. Built Python and SQL pipelines on Azure.";
const job = { title: "Senior Data Engineer", company: "Acme", description: "Requirements:\nPython, SQL, Azure and Kafka experience.\nNice to have: Airflow" };
const fresh = () => newContact({ name: "Jane Smith", company: "Acme", title: "Talent Acquisition Partner" }, now);
const withActivities = (types: Parameters<typeof newActivity>[0]["type"][], dates: string[] = []): Contact => {
  let s: ContactsStore = saveContact(EMPTY_CONTACTS, fresh(), now).store;
  types.forEach((t, i) => (s = logActivity(s, s.contacts[0].id, newActivity({ type: t, date: dates[i] ?? "2026-11-10" }, now), now)));
  return s.contacts[0];
};

describe("drafts only say what is true", () => {
  it("never claims earlier contact when none is recorded, and says so", () => {
    for (const kind of ["connection", "intro", "follow-up", "email"] as const) {
      const d = buildDraft({ kind, contact: fresh(), job, profile, appliedAt: null });
      expect(d.body).not.toMatch(/as we discussed|spoke|following up on our|thanks for speaking|I sent you|I wrote to you|Thank you for getting back/i);
      expect(d.body).not.toMatch(/\bapplied\b/i);
    }
    const followUp = buildDraft({ kind: "follow-up", contact: fresh(), job, profile, appliedAt: null });
    expect(followUp.notes.join(" ")).toMatch(/No contact with this person is recorded/);
  });

  it("refers to a connection request or message only when it was recorded, with its date", () => {
    const requested = buildDraft({ kind: "follow-up", contact: withActivities(["Connection request sent"], ["2026-11-10"]), job, profile, appliedAt: null });
    expect(requested.body).toContain("I sent you a connection request on 2026-11-10");
    const messaged = buildDraft({ kind: "follow-up", contact: withActivities(["Message sent"], ["2026-11-12"]), job, profile, appliedAt: null });
    expect(messaged.body).toContain("I wrote to you on 2026-11-12");
    const replied = buildDraft({ kind: "follow-up", contact: withActivities(["Message sent", "Reply received"], ["2026-11-12", "2026-11-14"]), job, profile, appliedAt: null });
    expect(replied.body).toContain("Thank you for getting back to me on 2026-11-14");
  });

  it("says you applied only with a recorded date", () => {
    expect(buildDraft({ kind: "intro", contact: fresh(), job, profile, appliedAt: "2026-11-15" }).body).toContain("I applied for the Senior Data Engineer role at Acme on 2026-11-15");
    expect(buildDraft({ kind: "intro", contact: fresh(), job, profile, appliedAt: null }).body).toContain("I am interested in the Senior Data Engineer role");
  });

  it("mentions only skills on the resume that the posting asks for, and your recorded years", () => {
    expect(sharedSkills(job, profile)).toEqual(expect.arrayContaining(["Python", "SQL", "Azure"]));
    expect(sharedSkills(job, profile)).not.toContain("Kafka");
    expect(sharedSkills(job, profile)).not.toContain("Airflow");
    const d = buildDraft({ kind: "intro", contact: fresh(), job, profile, appliedAt: null });
    expect(d.body).toContain("9 years of experience");
    expect(d.body).not.toMatch(/Kafka|Airflow/);
    expect(d.body).toContain(YOUR_NAME);
  });

  it("says the posting text is missing, rather than that your resume lacks the skills", () => {
    const d = buildDraft({ kind: "intro", contact: fresh(), job: { ...job, description: "" }, profile, appliedAt: null });
    expect(d.notes.join(" ")).toMatch(/posting text is not available/);
    expect(d.notes.join(" ")).not.toMatch(/None of the posting/);
  });

  it("includes nothing about your background without a resume, and says why", () => {
    const d = buildDraft({ kind: "intro", contact: fresh(), job, profile: null, appliedAt: null });
    expect(d.body).not.toMatch(/background|years/);
    expect(d.notes.join(" ")).toMatch(/No resume is selected/);
  });

  it("keeps a connection request within the note limit and leaves no placeholder in it", () => {
    const long = { ...job, title: "Senior Staff Principal Data Platform Engineering Lead ".repeat(3), company: "A Very Long Company Name Incorporated International Holdings" };
    const d = buildDraft({ kind: "connection", contact: fresh(), job: long, profile, appliedAt: "2026-11-15" });
    expect(d.body.length).toBeLessThanOrEqual(CONNECTION_NOTE_LIMIT);
    expect(d.subject).toBeNull();
    expect(buildDraft({ kind: "connection", contact: fresh(), job, profile, appliedAt: null }).body).not.toContain(YOUR_NAME);
  });

  it("an email has a subject and tells you to attach your own resume", () => {
    const d = buildDraft({ kind: "email", contact: fresh(), job, profile, appliedAt: null });
    expect(d.subject).toBe("Senior Data Engineer at Acme");
    expect(d.notes.join(" ")).toMatch(/Attach your resume yourself/);
  });
});

describe("suggested approach", () => {
  it("follows what is recorded and what is known", () => {
    expect(suggestApproach({ ...fresh(), status: "Verified" })[0]).toMatch(/short, specific message/);
    const requested = withActivities(["Connection request sent"]);
    expect(suggestApproach(requested).join(" ")).toMatch(/Wait about a week/);
    expect(suggestApproach(withActivities(["Message sent"])).join(" ")).toMatch(/single polite follow-up/);
    expect(suggestApproach({ ...fresh(), status: "Possible match" }).join(" ")).toMatch(/Check their profile/);
    expect(suggestApproach({ ...fresh(), cautions: ["A senior HR leader. Nothing found says they handle this posting."] }).join(" ")).toMatch(/recruiter or the hiring manager/);
  });
});

describe("checking an AI-written draft", () => {
  const ctx = (contact: Contact = fresh(), appliedAt: string | null = null) => ({ contact, profile, resumeText, job, appliedAt });
  it("accepts an honest draft", () => {
    const r = draftIsSafe("Hi Jane, I am interested in the Senior Data Engineer role at Acme. I have 9 years of experience with Python and SQL.\n[Your name]", ctx());
    expect(r).toEqual({ ok: true, reasons: [] });
  });
  it("rejects a claim of earlier contact that was not recorded", () => {
    expect(draftIsSafe("Thanks for speaking with me last week.", ctx()).ok).toBe(false);
    expect(draftIsSafe("As we discussed, I would love to join.", ctx()).ok).toBe(false);
    expect(draftIsSafe("I sent you a connection request earlier.", ctx()).ok).toBe(false);
    // The same words are fine once that contact is recorded.
    expect(draftIsSafe("I sent you a connection request earlier.", ctx(withActivities(["Connection request sent"]))).ok).toBe(true);
  });
  it("rejects saying you applied when no application is recorded", () => {
    expect(draftIsSafe("I applied for the role yesterday.", ctx()).ok).toBe(false);
    expect(draftIsSafe("I applied for the role.", ctx(fresh(), "2026-11-15")).ok).toBe(true);
  });
  it("rejects numbers that are not on the resume or in the posting", () => {
    const r = draftIsSafe("I have 15 years of experience and led 40 engineers.", ctx());
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/number 15/);
  });
  it("rejects skills that are neither on the resume nor in the posting, and claims of skills you lack", () => {
    expect(draftIsSafe("I am an expert in Rust and Go.", ctx()).ok).toBe(false);
    const r = draftIsSafe("I have deep experience with Kafka.", ctx());
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Kafka/);
  });
});

describe("links open in the person's own browser", () => {
  it("builds searches and an email link, and refuses anything but web links", () => {
    expect(linkedinPeopleSearch("Acme Inc")).toBe("https://www.linkedin.com/search/results/people/?keywords=recruiter%20Acme%20Inc");
    expect(googleSearch("a b")).toBe("https://www.google.com/search?q=a%20b");
    expect(searchLinks("Acme", "Data Engineer")).toHaveLength(3);
    expect(mailtoLink("jane@acme.example", "Hi there", "Line 1\nLine 2")).toBe("mailto:jane%40acme.example?subject=Hi%20there&body=Line%201%0ALine%202");
    expect(webLink("javascript:alert(1)")).toBeNull();
    expect(webLink("https://example.com/x")).toBe("https://example.com/x");
    expect(webLink(null)).toBeNull();
  });
});

/* ---------- the AI route ---------- */

const callRoute = (body: unknown, ip = "9.9.9.9") =>
  POST(new Request("http://x/api/networking-draft", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
let n = 0;
const payload = (over: Record<string, unknown> = {}) => ({ kind: "intro", contact: { name: "Jane Smith", title: "TA", company: "Acme", activities: [] }, job, profile, resumeText, appliedAt: null, ...over });

describe("the AI drafting route", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    ai.callStructured.mockReset();
    auth.requireSignedIn.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns an honest draft, labelled as AI-written", async () => {
    ai.callStructured.mockResolvedValue({ data: { subject: null, body: "Hi Jane, I am interested in the Senior Data Engineer role at Acme. I have 9 years of experience with Python.\n[Your name]" }, model: "m" });
    const body = await (await callRoute(payload(), `7.7.7.${++n}`)).json();
    expect(body.draft).toMatchObject({ kind: "intro", ai: true });
  });
  it("discards a draft that claims contact that was never recorded", async () => {
    ai.callStructured.mockResolvedValue({ data: { subject: null, body: "Hi Jane, thanks for speaking with me last week about the role." }, model: "m" });
    const body = await (await callRoute(payload(), `7.7.7.${++n}`)).json();
    expect(body.draft).toBeNull();
    expect(body.note).toMatch(/discarded/);
  });
  it("discards a connection note that is too long", async () => {
    ai.callStructured.mockResolvedValue({ data: { subject: null, body: "Hi Jane. ".repeat(60) }, model: "m" });
    const body = await (await callRoute(payload({ kind: "connection" }), `7.7.7.${++n}`)).json();
    expect(body.draft).toBeNull();
  });
  it("falls back, without error, when the AI call fails or there is no key", async () => {
    ai.callStructured.mockRejectedValue(new Error("boom"));
    const failed = await callRoute(payload(), `7.7.7.${++n}`);
    expect(failed.status).toBe(200);
    expect((await failed.json()).draft).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await (await callRoute(payload(), `7.7.7.${++n}`)).json()).note).toMatch(/API key/);
  });
  it("needs sign-in when the site has cloud sync, and rejects bad requests", async () => {
    auth.requireSignedIn.mockResolvedValue({ ok: false, status: 401, error: "Sign in" });
    expect((await callRoute(payload(), `7.7.7.${++n}`)).status).toBe(401);
    auth.requireSignedIn.mockResolvedValue({ ok: true });
    expect((await callRoute({ kind: "nope" }, `7.7.7.${++n}`)).status).toBe(400);
    expect(ai.callStructured).not.toHaveBeenCalled();
  });
});
