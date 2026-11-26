import { describe, expect, it } from "vitest";
import { BACKUP_APP, buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { mergeAppData } from "@/lib/cloud/sync";
import { MAX_FEEDBACK, feedbackForStatus, mergeFeedback, readFeedback, recordFeedback, type FeedbackEvent } from "@/lib/feedback";
import { sortJobs } from "@/lib/format";
import { scoreJob } from "@/lib/matching/engine";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES } from "@/types/job";
import { CANDIDATE, SCENARIOS } from "./fixtures/matching-fixtures";
import { makeJob } from "./helpers";

const now = new Date("2026-11-26T10:00:00Z");
const data: AppData = { resumes: [], activeResumeId: null, filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved: [] };

describe("outcome capture", () => {
  const job = makeJob();
  it("records the score shown and the correction", () => {
    const list = recordFeedback([], "skill_match_corrected", job, "Python", now);
    expect(list[0]).toMatchObject({ type: "skill_match_corrected", detail: "Python", title: "Data Engineer", score: null });
  });
  it("counts one view per job per day", () => {
    const once = recordFeedback(recordFeedback([], "viewed", job, undefined, now), "viewed", job, undefined, now);
    expect(once).toHaveLength(1);
  });
  it("is capped and skips damaged entries", () => {
    const many: FeedbackEvent[] = Array.from({ length: MAX_FEEDBACK + 5 }, (_, i) => ({ id: `e${i}`, at: now.toISOString(), type: "saved", jobKey: "k", title: "t", company: "c", score: 50 }));
    expect(readFeedback([...many, { nonsense: true }])).toHaveLength(MAX_FEEDBACK);
    expect(mergeFeedback(many, many)).toHaveLength(MAX_FEEDBACK);
  });
  it("maps application statuses to events", () => {
    expect(["Interested", "Preparing Application", "Applied", "Interview", "Offer", "Rejected", "Closed"].map((s) => feedbackForStatus(s as never))).toEqual(["saved", "application_started", "application_submitted", "interview", "offer", "rejected", null]);
  });
  it("travels in backups and sync without changing the backup version", () => {
    const feedback = recordFeedback([], "marked_irrelevant", job, undefined, now);
    const parsed = parseBackup(buildBackup({ ...data, feedback }));
    expect(parsed.ok && parsed.data.feedback).toEqual(feedback);
    expect(mergeAppData({ ...data, feedback }, data).feedback).toEqual(feedback);
    expect(JSON.parse(buildBackup(data)).app).toBe(BACKUP_APP);
    expect(mergeAppData(data, data).feedback).toBeUndefined();
  });
});

describe("highest match sort", () => {
  it("keeps jobs to verify after jobs you can apply to", () => {
    const match = (id: string) => scoreJob(SCENARIOS.find((s) => s.id === id)!.job, { profile: CANDIDATE, resumeText: null });
    const verify = makeJob({ id: "f", match: match("F") });
    const open = makeJob({ id: "g", match: match("G") });
    expect(sortJobs([verify, open], "score").map((j) => j.id)).toEqual(["g", "f"]);
  });
});
