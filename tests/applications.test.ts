import { describe, expect, it } from "vitest";
import {
  addDays,
  addInterview,
  addNote,
  computeReminders,
  createApplication,
  daysBetween,
  followUpsDue,
  isActive,
  isBeforeApplied,
  isOutcome,
  logContact,
  moveApplication,
  nextInterview,
  newInterview,
  parseDay,
  parseLocalDateTime,
  removeInterview,
  todayLocal,
  updateApplication,
  updateInterview,
  wasSent,
} from "@/lib/applications";
import { APPLICATION_STAGES, APPLICATION_STATUSES, legacyStatus, type Application } from "@/types/job";
import { makeJob } from "./helpers";

// Local times, so the tests do not depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const now = at(2026, 11, 22, 12, 0);
const resume = { id: "r1", name: "Data resume" };
const app = (status: Application["status"] = "Interested", over: Partial<Application> = {}): Application => ({ ...createApplication(makeJob({ id: "j1" }), status, now), ...over });
const texts = (a: Application) => (a.history ?? []).map((h) => h.text);

describe("the pipeline", () => {
  it("has the six stages in order, then three outcomes", () => {
    expect([...APPLICATION_STAGES]).toEqual(["New", "Interested", "Preparing Application", "Applied", "Interview", "Offer"]);
    expect(APPLICATION_STATUSES).toHaveLength(9);
  });
  it("separates finished applications from active ones", () => {
    expect(["Rejected", "Withdrawn", "Closed"].every((s) => isOutcome(s as never))).toBe(true);
    expect(isActive("Offer")).toBe(true);
    expect(isBeforeApplied("Preparing Application")).toBe(true);
    expect(isBeforeApplied("Applied")).toBe(false);
    expect(isBeforeApplied("Rejected")).toBe(false);
  });
  it("reads the old status names as the new ones", () => {
    expect(legacyStatus("Saved")).toBe("Interested");
    expect(legacyStatus("Interviewing")).toBe("Interview");
    expect(legacyStatus("Applied")).toBe("Applied");
    expect(legacyStatus("Nonsense")).toBe("Nonsense");
  });
});

describe("dates", () => {
  it("formats and parses local days", () => {
    expect(todayLocal(now)).toBe("2026-11-22");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("tomorrow")).toBeNull();
    expect(parseLocalDateTime("2026-12-03T14:30")?.getHours()).toBe(14);
    expect(parseLocalDateTime("2026-12-03")).toBeNull();
  });
  it("adds days across a month end and counts calendar days", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(daysBetween("2026-11-22", "2026-11-25")).toBe(3);
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2);
  });
  it("counts days correctly across the daylight saving change", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
  });
});

describe("creating an application", () => {
  it("starts as Interested with a history entry and no application date", () => {
    const a = createApplication(makeJob(), "Interested", now);
    expect(a.status).toBe("Interested");
    expect(a.appliedAt).toBeNull();
    expect(texts(a)).toEqual(["Added as Interested."]);
  });
  it("records the date, resume and a follow-up when created already applied", () => {
    const a = createApplication(makeJob(), "Applied", now, resume);
    expect(a).toMatchObject({ appliedAt: "2026-11-22", resumeVersionId: "r1", resumeName: "Data resume", followUpDate: "2026-11-29" });
  });
});

describe("moving through the pipeline", () => {
  it("records each move in the history", () => {
    const a = moveApplication(app("Interested"), "Preparing Application", now);
    expect(a.status).toBe("Preparing Application");
    expect(texts(a).at(-1)).toBe("Moved from Interested to Preparing Application.");
  });
  it("does nothing when the status is the same", () => {
    const a = app("Interested");
    expect(moveApplication(a, "Interested", now)).toBe(a);
  });
  it("applying sets the date once, records the resume, and suggests a follow-up a week out", () => {
    const a = moveApplication(app("Preparing Application"), "Applied", now, { resume });
    expect(a).toMatchObject({ appliedAt: "2026-11-22", resumeName: "Data resume", followUpDate: "2026-11-29" });
    expect(texts(a)).toEqual(expect.arrayContaining(["Application date set to 2026-11-22.", "Resume used: Data resume.", "Follow-up set for 2026-11-29."]));
  });
  it("never overwrites a date or follow-up you already set", () => {
    const start = app("Preparing Application", { appliedAt: "2026-11-01", followUpDate: "2026-12-24", resumeVersionId: "old", resumeName: "Old" });
    const a = moveApplication(start, "Applied", now, { resume });
    expect(a).toMatchObject({ appliedAt: "2026-11-01", followUpDate: "2026-12-24", resumeVersionId: "old" });
  });
  it("does not invent an application date for a job that was already applied to before dates were recorded", () => {
    const legacy = app("Applied", { appliedAt: null, followUpDate: null });
    const moved = moveApplication(legacy, "Interview", now, { resume });
    expect(moved.appliedAt).toBeNull();
    expect(moved.resumeVersionId).toBeNull();
    expect(texts(moved)).toEqual(["Added as Applied.", "Moved from Applied to Interview."]);
  });
  it("does set the date when a job that was closed without ever being applied to is reopened and applied", () => {
    const reopened = moveApplication(app("Closed", { appliedAt: null }), "Applied", now, { resume });
    expect(reopened.appliedAt).toBe("2026-11-22");
  });
  it("allows skipping stages and moving back", () => {
    const jumped = moveApplication(app("Interested"), "Offer", now);
    expect(jumped.status).toBe("Offer");
    expect(jumped.appliedAt).toBe("2026-11-22");
    expect(moveApplication(jumped, "Interested", now).status).toBe("Interested");
  });
  it("keeps the application date when moved back", () => {
    const back = moveApplication(moveApplication(app("Interested"), "Applied", now), "Interested", now);
    expect(back.appliedAt).toBe("2026-11-22");
  });
  it("records a rejection with its reason, and does not call a rejected job applied if it never was", () => {
    const a = moveApplication(app("Applied", { appliedAt: "2026-11-10" }), "Rejected", now, { rejectionReason: "  Position filled  " });
    expect(a.rejectionReason).toBe("Position filled");
    expect(texts(a)).toContain("Reason given: Position filled");
    const never = moveApplication(app("Interested"), "Rejected", now);
    expect(never.appliedAt).toBeNull();
  });
  it("calls a move out of an outcome a reopening", () => {
    const a = moveApplication(app("Closed"), "Interested", now);
    expect(texts(a).at(-1)).toBe("Reopened: moved from Closed to Interested.");
  });
  it("counts an application as sent from its date or its stage", () => {
    expect(wasSent({ status: "Interested", appliedAt: null })).toBe(false);
    expect(wasSent({ status: "Interested", appliedAt: "2026-11-01" })).toBe(true);
    expect(wasSent({ status: "Interview", appliedAt: null })).toBe(true);
    expect(wasSent({ status: "Rejected", appliedAt: null })).toBe(true);
    expect(wasSent({ status: "Withdrawn", appliedAt: null })).toBe(false);
  });
  it("never changes the application it is given", () => {
    const a = app("Interested");
    const copy = JSON.stringify(a);
    moveApplication(a, "Applied", now, { resume });
    expect(JSON.stringify(a)).toBe(copy);
  });
});

describe("editing", () => {
  it("logs a changed follow-up date and a cleared one, but not typed text", () => {
    let a = updateApplication(app("Applied"), { followUpDate: "2026-12-01" }, now);
    expect(texts(a).at(-1)).toBe("Follow-up set to 2026-12-01.");
    a = updateApplication(a, { followUpDate: null }, now);
    expect(texts(a).at(-1)).toBe("Follow-up cleared.");
    const before = (a.history ?? []).length;
    a = updateApplication(a, { notes: "a", coverLetter: "Dear team", recruiter: { name: "Sam", email: "", phone: "" } }, now);
    expect((a.history ?? []).length).toBe(before);
  });
  it("does not log a date that did not change", () => {
    const a = app("Applied", { followUpDate: "2026-12-01" });
    const before = (a.history ?? []).length;
    expect((updateApplication(a, { followUpDate: "2026-12-01" }, now).history ?? []).length).toBe(before);
  });
  it("logs the decision date and recording of an offer", () => {
    const a = updateApplication(app("Offer"), { offer: { salary: "$130,000", bonus: "", benefits: "", startDate: null, decideBy: "2026-12-05", notes: "" } }, now);
    expect(texts(a)).toEqual(expect.arrayContaining(["Offer decision date set to 2026-12-05.", "Offer details recorded."]));
  });
  it("adds notes and contacts to the history, ignoring blanks", () => {
    let a = addNote(app(), "Liked the team", now);
    a = logContact(a, "Recruiter called to confirm the screen", now);
    expect(a.history!.slice(-2).map((h) => h.kind)).toEqual(["note", "contact"]);
    expect(addNote(a, "   ", now)).toBe(a);
  });
  it("keeps the history to its newest 500 entries", () => {
    let a = app();
    for (let i = 0; i < 520; i++) a = addNote(a, `note ${i}`, now);
    expect(a.history).toHaveLength(500);
    expect(a.history!.at(-1)!.text).toBe("note 519");
  });
});

describe("interviews", () => {
  it("adds one, logs it, and moves an applied job to Interview", () => {
    const a = addInterview(app("Applied"), newInterview({ stage: "Technical", format: "Video", at: "2026-12-03T14:00" }), now, resume);
    expect(a.status).toBe("Interview");
    expect(a.interviews).toHaveLength(1);
    expect(texts(a)).toEqual(expect.arrayContaining(["Added: Technical interview, video on 2026-12-03 at 14:00.", "Moved from Applied to Interview."]));
  });
  it("moves a job that had not been applied to as well, and sets the date it went out", () => {
    const a = addInterview(app("Interested"), newInterview({ at: "2026-12-03T14:00" }), now);
    expect(a).toMatchObject({ status: "Interview", appliedAt: "2026-11-22" });
  });
  it("does not move an offer or a finished application back", () => {
    expect(addInterview(app("Offer"), newInterview(), now).status).toBe("Offer");
    expect(addInterview(app("Closed"), newInterview(), now).status).toBe("Closed");
  });
  it("logs a reschedule, a completion and the first feedback", () => {
    const iv = newInterview({ at: "2026-12-03T14:00" });
    let a = addInterview(app("Interview"), iv, now);
    a = updateInterview(a, iv.id, { at: "2026-12-04T10:00" }, now);
    a = updateInterview(a, iv.id, { status: "Completed" }, now);
    a = updateInterview(a, iv.id, { feedback: "Went well" }, now);
    expect(texts(a).slice(-3)).toEqual([
      "Rescheduled: Recruiter screen interview, video on 2026-12-04 at 10:00.",
      "Recruiter screen interview marked completed.",
      "Feedback recorded for the Recruiter screen interview.",
    ]);
  });
  it("removes an interview and says so; an unknown id changes nothing", () => {
    const iv = newInterview();
    const a = addInterview(app("Interview"), iv, now);
    expect(removeInterview(a, iv.id, now).interviews).toEqual([]);
    expect(removeInterview(a, "nope", now)).toBe(a);
    expect(updateInterview(a, "nope", { feedback: "x" }, now)).toBe(a);
  });
  it("finds the next scheduled interview that has not happened, and ignores cancelled and past ones", () => {
    const a: Application = {
      ...app("Interview"),
      interviews: [
        newInterview({ id: "past", at: "2026-11-20T10:00" }),
        newInterview({ id: "cancelled", at: "2026-11-23T10:00", status: "Cancelled" }),
        newInterview({ id: "later", at: "2026-12-10T10:00" }),
        newInterview({ id: "soon", at: "2026-11-25T09:00" }),
        newInterview({ id: "unset", at: null }),
      ],
    };
    expect(nextInterview(a, now)?.id).toBe("soon");
    expect(nextInterview({ ...a, interviews: [] }, now)).toBeNull();
  });
});

describe("reminders", () => {
  const withDates = (status: Application["status"], over: Partial<Application>, id = "j1"): Application => ({ ...createApplication(makeJob({ id }), status, now), ...over });
  const kinds = (r: ReturnType<typeof computeReminders>) => r.map((x) => `${x.kind}:${x.when}`);

  it("flags a follow-up that is due today, overdue, or coming up, and ignores one far away", () => {
    const apps = [
      withDates("Applied", { followUpDate: "2026-11-22" }, "a"),
      withDates("Applied", { followUpDate: "2026-11-19" }, "b"),
      withDates("Applied", { followUpDate: "2026-11-26" }, "c"),
      withDates("Applied", { followUpDate: "2026-12-30" }, "d"),
    ];
    const r = computeReminders(apps, now);
    expect(r.map((x) => x.app.job.id)).toEqual(["b", "a", "c"]);
    expect(kinds(r)).toEqual(["follow-up:Overdue by 3 days", "follow-up:Today", "follow-up:In 4 days"]);
    expect(followUpsDue(r)).toHaveLength(2);
  });

  it("never reminds about a finished application", () => {
    const apps = (["Rejected", "Withdrawn", "Closed"] as const).map((s, i) => withDates(s, { followUpDate: "2026-11-20", deadline: "2026-11-21" }, `x${i}`));
    expect(computeReminders(apps, now)).toEqual([]);
  });

  it("reminds about a deadline only until you have applied", () => {
    expect(computeReminders([withDates("Preparing Application", { deadline: "2026-11-24" })], now)[0]).toMatchObject({ kind: "deadline", when: "In 2 days" });
    // An application created as Applied also gets an automatic follow-up, so check only for a deadline reminder.
    expect(computeReminders([withDates("Applied", { deadline: "2026-11-24" })], now).some((r) => r.kind === "deadline")).toBe(false);
  });

  it("reminds about an expected reply only for applied and interviewing applications", () => {
    expect(computeReminders([withDates("Applied", { responseDue: "2026-11-21" })], now)[0]).toMatchObject({ kind: "response", overdue: true });
    expect(computeReminders([withDates("Interested", { responseDue: "2026-11-21" })], now)).toEqual([]);
  });

  it("reminds about an offer decision date", () => {
    const r = computeReminders([withDates("Offer", { offer: { salary: "", bonus: "", benefits: "", startDate: null, decideBy: "2026-11-24", notes: "" } })], now);
    expect(r[0]).toMatchObject({ kind: "offer", when: "In 2 days" });
  });

  it("lists upcoming interviews, flags one that has passed without a note, and skips cancelled ones", () => {
    const a = withDates("Interview", {
      interviews: [
        newInterview({ id: "soon", at: "2026-11-24T10:00", stage: "Technical" }),
        newInterview({ id: "earlier", at: "2026-11-22T09:00", stage: "Recruiter screen" }),
        newInterview({ id: "gone", at: "2026-11-23T10:00", status: "Cancelled" }),
        newInterview({ id: "done", at: "2026-11-21T10:00", status: "Completed" }),
        newInterview({ id: "far", at: "2026-12-20T10:00" }),
      ],
    });
    const r = computeReminders([a], now);
    expect(r.map((x) => x.label)).toEqual([
      expect.stringMatching(/^Record how it went: Recruiter screen interview/),
      expect.stringMatching(/^Technical interview/),
    ]);
    expect(r[0]).toMatchObject({ overdue: true, when: "Earlier today" });
    expect(r[1].when).toBe("In 2 days");
  });

  it("puts overdue first, then the soonest", () => {
    const apps = [
      withDates("Applied", { followUpDate: "2026-11-27" }, "later"),
      withDates("Applied", { followUpDate: "2026-11-23" }, "soon"),
      withDates("Applied", { followUpDate: "2026-11-15" }, "late"),
    ];
    expect(computeReminders(apps, now).map((x) => x.app.job.id)).toEqual(["late", "soon", "later"]);
  });

  it("ignores invalid dates instead of failing", () => {
    expect(computeReminders([withDates("Applied", { followUpDate: "not a date", deadline: "2026-13-45" })], now)).toEqual([]);
  });
});
