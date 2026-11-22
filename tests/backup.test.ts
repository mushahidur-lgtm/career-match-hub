import { describe, expect, it } from "vitest";
import { buildBackup, jobKey, mergeSavedJobs, parseBackup, type AppData } from "@/lib/backup";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES } from "@/types/job";
import { makeJob, makeSaved } from "./helpers";

const data = (over: Partial<AppData> = {}): AppData => ({
  resume: { text: "x".repeat(80), fileName: "cv.pdf", uploadedAt: "2026-11-01T00:00:00Z" },
  profile: null,
  filters: DEFAULT_FILTERS,
  preferences: DEFAULT_PREFERENCES,
  saved: [makeSaved(makeJob())],
  ...over,
});

describe("backup file", () => {
  it("round-trips without losing anything", () => {
    const original = data();
    const parsed = parseBackup(buildBackup(original));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual(original);
  });

  it("rejects text that is not JSON", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "That file is not valid JSON." });
  });

  it("rejects JSON from some other app", () => {
    expect(parseBackup(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("rejects a backup whose saved jobs are damaged", () => {
    const bad = JSON.parse(buildBackup(data()));
    bad.data.saved[0].status = "Hired!";
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a backup from a newer version it does not understand", () => {
    const future = JSON.parse(buildBackup(data()));
    future.version = 99;
    expect(parseBackup(JSON.stringify(future)).ok).toBe(false);
  });
});

describe("duplicate prevention", () => {
  it("merges the same job id once", () => {
    const a = makeSaved(makeJob({ id: "a" }));
    expect(mergeSavedJobs([a], [a])).toHaveLength(1);
  });

  it("treats the same title, company and place under a new id as the same job", () => {
    const a = makeSaved(makeJob({ id: "a" }));
    const b = makeSaved(makeJob({ id: "b" }), { updatedAt: "2026-11-05T00:00:00Z", status: "Applied" });
    const merged = mergeSavedJobs([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("Applied");
  });

  it("keeps distinct jobs", () => {
    const a = makeSaved(makeJob({ id: "a", company: "Acme" }));
    const b = makeSaved(makeJob({ id: "b", company: "Globex" }));
    expect(mergeSavedJobs([a], [b])).toHaveLength(2);
  });

  it("keeps the most recently updated copy and never drops your notes", () => {
    const mine = makeSaved(makeJob({ id: "a" }), { notes: "Phone screen Tuesday", updatedAt: "2026-11-10T00:00:00Z" });
    const old = makeSaved(makeJob({ id: "a" }), { notes: "", updatedAt: "2026-11-01T00:00:00Z" });
    expect(mergeSavedJobs([mine], [old])[0].notes).toBe("Phone screen Tuesday");
  });

  it("jobKey ignores case and spacing", () => {
    expect(jobKey({ title: "Data  Engineer", company: "ACME", location: "Ottawa, ON" })).toBe(
      jobKey({ title: "data engineer", company: "acme", location: "ottawa, on" }),
    );
  });
});
