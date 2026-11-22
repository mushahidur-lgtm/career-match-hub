import { describe, expect, it } from "vitest";
import { mergeSavedJobs } from "@/lib/backup";
import { computeOverview } from "@/lib/overview";
import { addSavedJob, findSaved, removeSavedJob, setSavedNotes, setSavedStatus } from "@/lib/saved";
import { makeJob, makeSaved } from "./helpers";

const now = new Date("2026-11-22T12:00:00Z");
// The same posting, as it came back from a later search under a different id and wording.
const tracked = makeJob({ id: "old-id", title: "Data Engineer", company: "Acme", location: "Ottawa, ON" });
const reposted = makeJob({ id: "new-id", title: "Data Engineer (Hybrid)", company: "Acme Inc.", location: "Ottawa, ON" });

describe("finding the tracked entry for a listing", () => {
  const list = [makeSaved(tracked, { status: "Applied" })];
  it("finds it by id", () => expect(findSaved(list, tracked)?.status).toBe("Applied"));
  it("finds it when the posting comes back under a new id and wording", () => expect(findSaved(list, reposted)?.job.id).toBe("old-id"));
  it("does not find a different job", () => expect(findSaved(list, makeJob({ id: "x", company: "Globex" }))).toBeUndefined());
});

describe("saving never creates a second application for the same posting", () => {
  const list = [makeSaved(tracked)];
  it("ignores the same posting under another id and wording", () => {
    expect(addSavedJob(list, reposted, "Interested", now)).toHaveLength(1);
  });
  it("ignores the exact same listing", () => {
    expect(addSavedJob(list, tracked, "Interested", now)).toHaveLength(1);
  });
  it("adds a genuinely different job at the top", () => {
    const next = addSavedJob(list, makeJob({ id: "g", company: "Globex" }), "Applied", now);
    expect(next).toHaveLength(2);
    expect(next[0].job.company).toBe("Globex");
    expect(next[0]).toMatchObject({ status: "Applied", notes: "" });
  });
  it("two jobs from unknown employers are both kept", () => {
    const a = makeJob({ id: "u1", company: "Company not listed" });
    const b = makeJob({ id: "u2", company: "Company not listed" });
    expect(addSavedJob(addSavedJob([], a, "Interested", now), b, "Interested", now)).toHaveLength(2);
  });
});

describe("changing a tracked job reaches the entry even when the listing on screen has a different id", () => {
  const list = [makeSaved(tracked, { status: "Interested", notes: "first" })];
  // The card shows `reposted`, finds the entry, and acts on the entry's own id.
  const entry = findSaved(list, reposted)!;

  it("status", () => expect(setSavedStatus(list, entry.job.id, "Interview", now)[0].status).toBe("Interview"));
  it("notes are kept, not dropped", () => expect(setSavedNotes(list, entry.job.id, "Phone screen Tuesday", now)[0].notes).toBe("Phone screen Tuesday"));
  it("remove", () => expect(removeSavedJob(list, entry.job.id)).toEqual([]));
  it("acting on the id of the listing on screen would have done nothing, which is why the entry's id is used", () => {
    expect(setSavedStatus(list, reposted.id, "Interview", now)[0].status).toBe("Interested");
  });
  it("only the targeted entry changes and its time is updated", () => {
    const two = [...list, makeSaved(makeJob({ id: "other", company: "Globex" }))];
    const next = setSavedStatus(two, "old-id", "Offer", now);
    expect(next[0].updatedAt).toBe(now.toISOString());
    expect(next[1]).toBe(two[1]);
  });
});

describe("one meaning of same job everywhere", () => {
  it("merging a backup does not duplicate a posting worded differently", () => {
    const merged = mergeSavedJobs([makeSaved(tracked, { updatedAt: "2026-11-10T00:00:00Z" })], [makeSaved(reposted, { updatedAt: "2026-11-01T00:00:00Z" })]);
    expect(merged).toHaveLength(1);
  });
  it("the Overview counts it once and keeps your status", () => {
    const results = {
      jobs: [reposted],
      mode: "live" as const,
      provider: "adzuna" as const,
      scoring: "heuristic" as const,
      warnings: [],
      filters: { query: "", location: "", category: "All" as const, workMode: "All" as const, employmentType: "All" as const, minSalary: null },
      searchedAt: now.toISOString(),
      profileKey: "",
    };
    const o = computeOverview(results, [makeSaved(tracked, { status: "Applied" })], now);
    expect(o.activeOpportunities).toBe(1);
    expect(o.opportunities[0].status).toBe("Applied");
    expect(o.applicationsSent).toBe(1);
  });
});
