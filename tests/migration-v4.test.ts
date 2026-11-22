import { describe, expect, it } from "vitest";
import { buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { SavedJobsSchema } from "@/lib/schemas";
import { STORAGE_VERSION, VERSION_KEY, clearSnapshots, hasSnapshots, migrateStorage } from "@/lib/storage";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES } from "@/types/job";
import { makeJob, makeSaved, memoryStorage } from "./helpers";

const entry = (status: string, id = "j1") => ({ ...makeSaved(makeJob({ id })), status });
const atV3 = (saved: unknown[], extra: Record<string, string> = {}) => memoryStorage({ [VERSION_KEY]: "3", "cmh:saved": JSON.stringify(saved), ...extra });
const apps = (s: ReturnType<typeof memoryStorage>) => JSON.parse(s.getItem("cmh:applications")!) as { status: string; notes: string }[];

describe("saved jobs become applications", () => {
  it("copies them under a new key with the new status names", () => {
    const s = atV3([entry("Saved", "a"), entry("Interviewing", "b"), entry("Applied", "c"), entry("Offer", "d"), entry("Rejected", "e")]);
    migrateStorage(s);
    expect(apps(s).map((a) => a.status)).toEqual(["Interested", "Interview", "Applied", "Offer", "Rejected"]);
    expect(s.getItem(VERSION_KEY)).toBe(String(STORAGE_VERSION));
  });

  it("leaves the old key exactly as it was, so the previous release still shows your jobs", () => {
    const original = JSON.stringify([entry("Saved"), entry("Interviewing", "b")]);
    const s = memoryStorage({ [VERSION_KEY]: "3", "cmh:saved": original });
    migrateStorage(s);
    expect(s.getItem("cmh:saved")).toBe(original);
  });

  it("takes a snapshot first, and keeps notes and every other field", () => {
    const s = atV3([{ ...entry("Saved"), notes: "Phone screen Tuesday" }]);
    expect(migrateStorage(s).snapshot).toBe(true);
    expect(JSON.parse(s.getItem("cmh:backup:pre-v4")!).keys["cmh:saved"]).toContain("Phone screen Tuesday");
    expect(apps(s)[0].notes).toBe("Phone screen Tuesday");
  });

  it("does not run twice and does not overwrite applications you already have", () => {
    const s = atV3([entry("Saved")], { "cmh:applications": '[{"mine":true}]' });
    migrateStorage(s);
    expect(s.getItem("cmh:applications")).toBe('[{"mine":true}]');
    expect(migrateStorage(s).migrated).toBe(false);
  });

  it("still migrates when a failed earlier attempt left an empty list", () => {
    const s = atV3([entry("Saved")], { "cmh:applications": "[]" });
    migrateStorage(s);
    expect(apps(s)).toHaveLength(1);
  });

  it("is tried again when writing the applications fails, and keeps the old key", () => {
    const base = atV3([entry("Saved")]);
    const failing = {
      getItem: (k: string) => base.getItem(k),
      setItem: (k: string, v: string) => {
        if (k === "cmh:applications") throw new Error("QuotaExceededError");
        base.setItem(k, v);
      },
      removeItem: (k: string) => base.removeItem(k),
      key: (i: number) => base.key(i),
      get length() {
        return base.length;
      },
    };
    expect(migrateStorage(failing).migrated).toBe(false);
    expect(base.getItem(VERSION_KEY)).toBe("3");
    expect(migrateStorage(base).migrated).toBe(true);
    expect(apps(base)).toHaveLength(1);
  });

  it("does nothing for someone with no saved jobs", () => {
    const s = memoryStorage({ [VERSION_KEY]: "3", "cmh:saved": "[]" });
    migrateStorage(s);
    expect(s.getItem("cmh:applications")).toBeNull();
  });

  it("only offers to clear the old saved-jobs key once the applications hold the data", () => {
    const s = atV3([entry("Saved")]);
    migrateStorage(s);
    expect(hasSnapshots(s)).toBe(true);
    clearSnapshots(s);
    expect(s.getItem("cmh:saved")).toBeNull();
    expect(apps(s)).toHaveLength(1);

    const empty = memoryStorage({ [VERSION_KEY]: "3", "cmh:saved": JSON.stringify([entry("Saved")]), "cmh:applications": "[]" });
    clearSnapshots(empty);
    expect(empty.getItem("cmh:saved")).not.toBeNull();
  });
});

describe("reading old and new statuses", () => {
  it("accepts every current status and reads the two old names as their replacements", () => {
    for (const status of ["New", "Interested", "Preparing Application", "Applied", "Interview", "Offer", "Rejected", "Withdrawn", "Closed"]) {
      expect(SavedJobsSchema.safeParse([entry(status)]).success).toBe(true);
    }
    const old = SavedJobsSchema.parse([entry("Saved"), entry("Interviewing", "b")]);
    expect(old.map((a) => a.status)).toEqual(["Interested", "Interview"]);
  });
  it("rejects a status that does not exist", () => {
    expect(SavedJobsSchema.safeParse([entry("Hired")]).success).toBe(false);
  });
  it("accepts applications saved before the new fields existed", () => {
    expect(SavedJobsSchema.safeParse([entry("Applied")]).success).toBe(true);
  });
});

describe("backups", () => {
  const data = (saved: unknown[]): AppData => ({ resumes: [], activeResumeId: null, filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved: saved as AppData["saved"] });

  it("a current backup carries the new fields", () => {
    const withFields = { ...entry("Applied"), followUpDate: "2026-12-01", recruiter: { name: "Sam", email: "s@example.com", phone: "" }, history: [{ id: "h1", at: "2026-11-22T00:00:00Z", kind: "note", text: "Hello" }] };
    const parsed = parseBackup(buildBackup(data([withFields])));
    expect(parsed.ok && parsed.data.saved[0]).toMatchObject({ followUpDate: "2026-12-01", recruiter: { name: "Sam" } });
  });

  it("an older backup with the old status names imports with the new ones", () => {
    const old = JSON.parse(buildBackup(data([entry("Saved"), entry("Interviewing", "b")])));
    old.version = 2;
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.ok && parsed.data.saved.map((s) => s.status)).toEqual(["Interested", "Interview"]);
  });
});
