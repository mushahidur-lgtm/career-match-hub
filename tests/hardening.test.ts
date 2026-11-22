import { describe, expect, it } from "vitest";
import {
  addInterview,
  clampApplication,
  computeReminders,
  createApplication,
  moveApplication,
  newInterview,
  plausibleDay,
  updateApplication,
  updateInterview,
} from "@/lib/applications";
import { readApplications } from "@/lib/applications-load";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_REFINE, RefineSchema } from "@/lib/refine";
import { SavedJobSchema, SavedJobsSchema } from "@/lib/schemas";
import type { Application } from "@/types/job";
import { makeJob, makeSaved } from "./helpers";

const now = new Date(2026, 10, 22, 12, 0);
const later = (s: number) => new Date(now.getTime() + s * 1000);
const app = (status: Application["status"] = "Applied"): Application => createApplication(makeJob({ id: "j1" }), status, now);
const accepted = (a: Application) => SavedJobsSchema.safeParse([a]).success;

describe("whatever you can type can be saved and read back", () => {
  const long = (n: number) => "x".repeat(n);

  it("long contact details are cut to what is stored", () => {
    const a = updateApplication(app(), { recruiter: { name: long(500), email: long(500), phone: "613-555-1234 ext 22, mobile 613-555-9999, after 3pm please call the office first" } }, now);
    expect(a.recruiter!.phone.length).toBeLessThanOrEqual(LIMITS.phone);
    expect(a.recruiter!.name.length).toBe(LIMITS.name);
    expect(accepted(a)).toBe(true);
  });

  it("every text field is accepted at and beyond its maximum", () => {
    const a = updateApplication(
      app(),
      {
        notes: long(LIMITS.notes + 500),
        coverLetter: long(LIMITS.coverLetter + 500),
        salaryExpectation: long(LIMITS.salaryExpectation + 50),
        rejectionReason: long(LIMITS.rejectionReason + 50),
        offer: { salary: long(300), bonus: long(300), benefits: long(LIMITS.offerBenefits + 50), startDate: null, decideBy: null, notes: long(LIMITS.offerNotes + 50) },
      },
      now,
    );
    expect(a.notes.length).toBe(LIMITS.notes);
    expect(a.coverLetter!.length).toBe(LIMITS.coverLetter);
    expect(a.offer!.salary.length).toBe(LIMITS.offerShort);
    expect(accepted(a)).toBe(true);
  });

  it("interview text and lists are cut to what is stored, keeping the first lines", () => {
    const iv = newInterview();
    let a = addInterview(app(), iv, now);
    a = updateInterview(
      a,
      iv.id,
      {
        interviewers: long(LIMITS.interviewers + 100),
        prepNotes: long(LIMITS.prepNotes + 100),
        feedback: long(LIMITS.feedback + 100),
        topicsToReview: Array.from({ length: LIMITS.topicsMax + 5 }, (_, i) => `${i}-${long(300)}`),
        questionsToAsk: Array.from({ length: LIMITS.questionsMax + 5 }, (_, i) => `${i}-${long(700)}`),
      },
      now,
    );
    const stored = a.interviews![0];
    expect(stored.topicsToReview).toHaveLength(LIMITS.topicsMax);
    expect(stored.topicsToReview[0].length).toBe(LIMITS.topic);
    expect(stored.questionsToAsk).toHaveLength(LIMITS.questionsMax);
    expect(stored.questionsToAsk[0].length).toBe(LIMITS.question);
    expect(accepted(a)).toBe(true);
  });

  it("adding the 41st interview does nothing instead of producing something that cannot be read", () => {
    let a = app();
    for (let i = 0; i < LIMITS.interviewsMax + 5; i++) a = addInterview(a, newInterview({ at: "2026-12-03T10:00" }), now);
    expect(a.interviews).toHaveLength(LIMITS.interviewsMax);
    expect(accepted(a)).toBe(true);
  });

  it("a long history and long notes added to it stay readable", () => {
    let a = app();
    for (let i = 0; i < LIMITS.historyMax + 30; i++) a = { ...a, history: [...(a.history ?? [])] };
    expect(accepted(clampApplication(a))).toBe(true);
  });

  it("an application with every optional field filled in at its limit passes the schema", () => {
    const iv = newInterview({ at: "2026-12-03T10:00" });
    let a = addInterview(app(), iv, now);
    a = updateApplication(a, { recruiter: { name: long(LIMITS.name), email: long(LIMITS.email), phone: long(LIMITS.phone) }, followUpDate: "2026-12-01", deadline: "2026-12-02", responseDue: "2026-12-03" }, now);
    expect(SavedJobSchema.safeParse(a).success).toBe(true);
  });
});

describe("loading applications one at a time", () => {
  const good = (id: string, over = {}) => ({ ...makeSaved(makeJob({ id })), ...over });

  it("keeps the readable ones and returns only the damaged ones", () => {
    const r = readApplications([good("a"), { nonsense: true }, good("b", { status: "Hired" }), good("c")]);
    expect(r.kept.map((x) => x.job.id)).toEqual(["a", "c"]);
    expect(r.rejected).toHaveLength(2);
  });
  it("reads old status names", () => {
    const r = readApplications([good("a", { status: "Saved" }), good("b", { status: "Interviewing" })]);
    expect(r.kept.map((x) => x.status)).toEqual(["Interested", "Interview"]);
  });
  it("sets aside a second copy of the same job id", () => {
    const r = readApplications([good("a"), good("a", { notes: "dupe" })]);
    expect(r.kept).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });
  it("an entry with one over-long field no longer takes the others down", () => {
    const r = readApplications([good("a"), good("b", { recruiter: { name: "n", email: "e", phone: "1".repeat(500) } })]);
    expect(r.kept.map((x) => x.job.id)).toEqual(["a"]);
    expect(r.rejected).toHaveLength(1);
  });
  it("an empty list loads as empty", () => {
    expect(readApplications([])).toEqual({ kept: [], rejected: [] });
  });
});

describe("saved filters from before the pipeline grew", () => {
  it("read an old status name as its replacement instead of failing", () => {
    expect(RefineSchema.parse({ ...DEFAULT_REFINE, status: "Saved" }).status).toBe("Interested");
    expect(RefineSchema.parse({ ...DEFAULT_REFINE, status: "Interviewing" }).status).toBe("Interview");
    expect(RefineSchema.safeParse({ ...DEFAULT_REFINE, status: "Not tracked" }).success).toBe(true);
    expect(RefineSchema.safeParse({ ...DEFAULT_REFINE, status: "Hired" }).success).toBe(false);
  });
});

describe("the application date is never made up", () => {
  const job = makeJob({ id: "j2" });
  it("is today only for a job added as Applied, and blank for Interview and Offer", () => {
    expect(createApplication(job, "Applied", now).appliedAt).toBe("2026-11-22");
    expect(createApplication(job, "Interview", now).appliedAt).toBeNull();
    expect(createApplication(job, "Offer", now).appliedAt).toBeNull();
    expect(createApplication(job, "Interested", now).appliedAt).toBeNull();
  });
  it("uses the date you give, including a past one, and blank for unknown", () => {
    expect(createApplication(job, "Interview", now, null, "2026-10-30").appliedAt).toBe("2026-10-30");
    expect(createApplication(job, "Applied", now, null, null).appliedAt).toBeNull();
  });
  it("does not stamp today when an interview moves a job forward, or when a card is moved straight to Interview", () => {
    const viaInterview = addInterview(createApplication(job, "Interested", now), newInterview(), now);
    expect(viaInterview.status).toBe("Interview");
    expect(viaInterview.appliedAt).toBeNull();
    expect(moveApplication(createApplication(job, "Interested", now), "Interview", now).appliedAt).toBeNull();
  });
  it("still stamps it when you actually move the job to Applied", () => {
    expect(moveApplication(createApplication(job, "Preparing Application", now), "Applied", now).appliedAt).toBe("2026-11-22");
  });
});

describe("typing a date does not fill the history with junk", () => {
  const texts = (a: Application) => (a.history ?? []).map((h) => h.text);

  it("treats the steps of typing a year as one edit", () => {
    let a = app();
    a = updateApplication(a, { followUpDate: "2026-12-01" }, later(1));
    a = updateApplication(a, { followUpDate: "2026-12-02" }, later(2));
    a = updateApplication(a, { followUpDate: "2026-12-05" }, later(4));
    expect(texts(a).filter((t) => t.startsWith("Follow-up"))).toEqual(["Follow-up set to 2026-12-05."]);
  });
  it("does not log a date with an impossible year while typing, but still stores it", () => {
    let a = app();
    const before = texts(a).length;
    a = updateApplication(a, { followUpDate: "0002-12-01" }, later(1));
    a = updateApplication(a, { followUpDate: "0020-12-01" }, later(2));
    expect(texts(a)).toHaveLength(before);
    expect(a.followUpDate).toBe("0020-12-01");
    expect(plausibleDay("0020-12-01")).toBe(false);
    expect(plausibleDay("2026-12-01")).toBe(true);
  });
  it("logs a later, separate change as its own entry", () => {
    let a = updateApplication(app(), { followUpDate: "2026-12-01" }, later(1));
    a = updateApplication(a, { followUpDate: "2026-12-09" }, later(600));
    expect(texts(a).filter((t) => t.startsWith("Follow-up"))).toEqual(["Follow-up set to 2026-12-01.", "Follow-up set to 2026-12-09."]);
  });
  it("does not merge a different field into the previous entry", () => {
    let a = updateApplication(app(), { followUpDate: "2026-12-01" }, later(1));
    a = updateApplication(a, { deadline: "2026-12-04" }, later(2));
    expect(texts(a).slice(-2)).toEqual(["Follow-up set to 2026-12-01.", "Application deadline set to 2026-12-04."]);
  });
  it("treats rescheduling an interview by typing as one edit, and ignores a junk year", () => {
    const iv = newInterview({ at: "2026-12-03T10:00" });
    let a = addInterview(app(), iv, now);
    a = updateInterview(a, iv.id, { at: "0002-12-04T10:00" }, later(1));
    a = updateInterview(a, iv.id, { at: "2026-12-04T10:00" }, later(2));
    a = updateInterview(a, iv.id, { at: "2026-12-05T10:00" }, later(3));
    expect(texts(a).filter((t) => t.startsWith("Rescheduled"))).toHaveLength(1);
    expect(texts(a).filter((t) => t.startsWith("Rescheduled"))[0]).toMatch(/2026-12-05/);
  });
  it("reminders ignore a date with an impossible year", () => {
    const a = { ...app(), followUpDate: "0002-12-01", deadline: "0020-12-01" };
    expect(computeReminders([a], now)).toEqual([]);
  });
});
