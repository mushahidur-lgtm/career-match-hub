import { describe, expect, it } from "vitest";
import { LEGACY_SNAPSHOT_KEY, STORAGE_VERSION, VERSION_KEY, listRecovered, migrateStorage, stashUnreadable } from "@/lib/storage";
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
