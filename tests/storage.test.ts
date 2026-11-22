import { describe, expect, it } from "vitest";
import { LEGACY_SNAPSHOT_KEY, STORAGE_VERSION, VERSION_KEY, clearSnapshots, hasSnapshots, listRecovered, migrateStorage, stashUnreadable } from "@/lib/storage";
import { memoryStorage } from "./helpers";

describe("storage migration", () => {
  it("does nothing for a brand-new browser", () => {
    const s = memoryStorage();
    expect(migrateStorage(s)).toEqual({ migrated: true, snapshot: false });
    expect(s.getItem(LEGACY_SNAPSHOT_KEY)).toBeNull();
    expect(s.getItem(VERSION_KEY)).toBe(String(STORAGE_VERSION));
  });

  it("snapshots existing data before upgrading and leaves it untouched", () => {
    const s = memoryStorage({ "cmh:saved": '[{"a":1}]', "cmh:resume": '{"text":"hi"}' });
    expect(migrateStorage(s)).toEqual({ migrated: true, snapshot: true });
    expect(s.getItem("cmh:saved")).toBe('[{"a":1}]');
    const snap = JSON.parse(s.getItem(LEGACY_SNAPSHOT_KEY)!);
    expect(snap.keys["cmh:saved"]).toBe('[{"a":1}]');
    expect(snap.keys["cmh:resume"]).toBe('{"text":"hi"}');
  });

  it("runs only once", () => {
    const s = memoryStorage({ "cmh:saved": "[]" });
    migrateStorage(s);
    expect(migrateStorage(s)).toEqual({ migrated: false, snapshot: false });
  });

  it("never overwrites an existing snapshot", () => {
    const s = memoryStorage({ "cmh:saved": "[1]", [LEGACY_SNAPSHOT_KEY]: "original" });
    migrateStorage(s);
    expect(s.getItem(LEGACY_SNAPSHOT_KEY)).toBe("original");
  });

  it("ignores keys from other apps", () => {
    expect(migrateStorage(memoryStorage({ theme: "dark" })).snapshot).toBe(false);
  });
});

describe("filter defaults on upgrade", () => {
  const old = { query: "BI Developer", location: "Toronto, ON", category: "All", workMode: "All", employmentType: "All", minSalary: null };

  it("moves untouched v1 filters to permanent full-time with the minimum salary", () => {
    const s = memoryStorage({ "cmh:filters": JSON.stringify(old) });
    migrateStorage(s);
    expect(JSON.parse(s.getItem("cmh:filters")!)).toMatchObject({ query: "BI Developer", employmentType: "Permanent full-time", minSalary: 100000 });
  });

  it("leaves deliberate choices alone", () => {
    const chosen = JSON.stringify({ ...old, employmentType: "Contract" });
    const s = memoryStorage({ "cmh:filters": chosen });
    migrateStorage(s);
    expect(s.getItem("cmh:filters")).toBe(chosen);
    const withSalary = JSON.stringify({ ...old, minSalary: 80000 });
    const t = memoryStorage({ "cmh:filters": withSalary });
    migrateStorage(t);
    expect(t.getItem("cmh:filters")).toBe(withSalary);
  });

  it("keeps the original in the snapshot", () => {
    const s = memoryStorage({ "cmh:filters": JSON.stringify(old) });
    migrateStorage(s);
    expect(JSON.parse(JSON.parse(s.getItem(LEGACY_SNAPSHOT_KEY)!).keys["cmh:filters"]).employmentType).toBe("All");
  });
});

describe("recovery of unreadable data", () => {
  it("keeps the raw value and lists it", () => {
    const s = memoryStorage();
    stashUnreadable(s, "cmh:saved", "{broken");
    expect(listRecovered(s)).toEqual(["cmh:saved"]);
    expect(JSON.parse(s.getItem("cmh:recovered:cmh:saved")!).raw).toBe("{broken");
  });
});

/** Wraps a storage so writes to some keys fail, like a full quota. */
function failingOn(inner: ReturnType<typeof memoryStorage>, fails: (key: string) => boolean) {
  return {
    getItem: (k: string) => inner.getItem(k),
    setItem: (k: string, v: string) => {
      if (fails(k)) throw new Error("QuotaExceededError");
      inner.setItem(k, v);
    },
    removeItem: (k: string) => inner.removeItem(k),
    key: (i: number) => inner.key(i),
    get length() {
      return inner.length;
    },
  };
}

describe("upgrade to resume versions", () => {
  const legacyResume = JSON.stringify({ text: "Senior Data Engineer resume text ".repeat(4), fileName: "Jordan_Lee-CV.pdf", uploadedAt: "2026-11-01T00:00:00Z" });
  const legacyProfile = JSON.stringify({ summary: "s", yearsOfExperience: 9, seniority: "Senior", skills: { languages: ["Python"], frameworks: [], cloudData: [], tools: [] }, detectedRoles: [], recommendedRoles: [], source: "heuristic" });
  const atV2 = (extra: Record<string, string> = {}) => memoryStorage({ [VERSION_KEY]: "2", "cmh:resume": legacyResume, "cmh:profile": legacyProfile, ...extra });

  it("turns the single resume and profile into the first version and makes it active", () => {
    const s = atV2();
    migrateStorage(s);
    const versions = JSON.parse(s.getItem("cmh:resumes")!);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ id: "legacy-1", name: "Jordan Lee CV", fileName: "Jordan_Lee-CV.pdf" });
    expect(versions[0].profile.seniority).toBe("Senior");
    expect(JSON.parse(s.getItem("cmh:activeResume")!)).toBe("legacy-1");
  });

  it("saves the originals in a snapshot and keeps the old keys, so rolling back still works", () => {
    const s = atV2();
    expect(migrateStorage(s).snapshot).toBe(true);
    expect(s.getItem("cmh:resume")).toBe(legacyResume);
    expect(s.getItem("cmh:profile")).toBe(legacyProfile);
    const snap = JSON.parse(s.getItem("cmh:backup:pre-v3")!);
    expect(snap.keys["cmh:resume"]).toBe(legacyResume);
    expect(snap.keys["cmh:profile"]).toBe(legacyProfile);
    expect(snap.fromVersion).toBe(2);
  });

  it("carries a user on layout 1 through both upgrades, with a snapshot for each", () => {
    const s = memoryStorage({ "cmh:resume": legacyResume, "cmh:profile": legacyProfile, "cmh:filters": JSON.stringify({ employmentType: "All", minSalary: null }) });
    migrateStorage(s);
    expect(s.getItem(VERSION_KEY)).toBe(String(STORAGE_VERSION));
    expect(s.getItem("cmh:backup:pre-v2")).not.toBeNull();
    expect(s.getItem("cmh:backup:pre-v3")).not.toBeNull();
    expect(JSON.parse(s.getItem("cmh:resumes")!)).toHaveLength(1);
    expect(JSON.parse(s.getItem("cmh:filters")!).employmentType).toBe("Permanent full-time");
  });

  it("leaves existing versions alone and does not run twice", () => {
    const s = atV2({ "cmh:resumes": '[{"id":"mine"}]' });
    migrateStorage(s);
    expect(s.getItem("cmh:resumes")).toBe('[{"id":"mine"}]');
    const again = migrateStorage(s);
    expect(again.migrated).toBe(false);
  });

  it("keeps the old keys when the profile is unreadable, rather than losing the resume", () => {
    const s = atV2({ "cmh:profile": "{broken" });
    migrateStorage(s);
    expect(s.getItem("cmh:resume")).toBe(legacyResume);
    expect(s.getItem("cmh:resumes")).toBeNull();
  });

  it("does nothing for someone who never added a resume", () => {
    const s = memoryStorage({ [VERSION_KEY]: "2", "cmh:saved": "[]" });
    migrateStorage(s);
    expect(s.getItem("cmh:resumes")).toBeNull();
  });

  it("clears snapshots only when asked, and reports whether any exist", () => {
    const s = atV2();
    migrateStorage(s);
    expect(hasSnapshots(s)).toBe(true);
    // The snapshot, plus the two old single-resume copies that are now only leftovers.
    expect(clearSnapshots(s)).toBe(3);
    expect(hasSnapshots(s)).toBe(false);
    expect(s.getItem("cmh:resumes")).not.toBeNull();
    expect(s.getItem("cmh:resume")).toBeNull();
  });

  it("never clears the old copies unless the resume versions exist", () => {
    const s = memoryStorage({ [VERSION_KEY]: "2", "cmh:resume": legacyResume, "cmh:profile": legacyProfile, "cmh:resumes": "[]" });
    expect(hasSnapshots(s)).toBe(false);
    expect(clearSnapshots(s)).toBe(0);
    expect(s.getItem("cmh:resume")).toBe(legacyResume);
  });

  it("still migrates when a failed earlier attempt left an empty list behind", () => {
    const s = atV2({ "cmh:resumes": "[]" });
    migrateStorage(s);
    expect(JSON.parse(s.getItem("cmh:resumes")!)).toHaveLength(1);
  });

  it("still migrates when the snapshot cannot be written (storage full)", () => {
    const s = failingOn(atV2(), (k) => k.startsWith("cmh:backup:"));
    expect(migrateStorage(s)).toEqual({ migrated: true, snapshot: false });
    expect(JSON.parse(s.getItem("cmh:resumes")!)).toHaveLength(1);
    expect(s.getItem("cmh:resume")).toBe(legacyResume);
  });

  it("does not mark the upgrade done when writing the versions fails, so it is tried again", () => {
    const base = atV2();
    const failing = failingOn(base, (k) => k === "cmh:resumes");
    expect(migrateStorage(failing)).toEqual({ migrated: false, snapshot: true });
    expect(base.getItem(VERSION_KEY)).toBe("2");
    expect(base.getItem("cmh:resume")).toBe(legacyResume);
    expect(migrateStorage(base).migrated).toBe(true);
    expect(JSON.parse(base.getItem("cmh:resumes")!)).toHaveLength(1);
  });
});
