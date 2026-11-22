import { describe, expect, it } from "vitest";
import { duplicateKey, mergeDuplicates, normalizeCompany, normalizeTitle } from "@/lib/dedupe";
import { freshness, levelBucket } from "@/lib/job-meta";
import { makeJob } from "./helpers";

describe("matching the same employer and title", () => {
  it("treats company suffixes and punctuation as the same employer", () => {
    expect(normalizeCompany("Acme Inc.")).toBe("acme");
    expect(normalizeCompany("ACME, Incorporated")).toBe("acme");
    expect(normalizeCompany("Acme (Canada) Ltd")).toBe("acme");
    expect(normalizeCompany("Rideau Bank")).toBe("rideau bank");
  });
  it("drops work-mode tags from titles but keeps the level", () => {
    expect(normalizeTitle("Data Engineer (Hybrid)")).toBe("data engineer");
    expect(normalizeTitle("Sr. Data Engineer - Remote")).toBe("senior data engineer");
    expect(normalizeTitle("Senior Data Engineer")).not.toBe(normalizeTitle("Data Engineer"));
  });
  it("never keys a job with an unknown employer", () => {
    expect(duplicateKey({ title: "Data Engineer", company: "Company not listed", location: "Ottawa, ON" })).toBeNull();
    expect(duplicateKey({ title: "Data Engineer", company: "", location: "Ottawa, ON" })).toBeNull();
  });
});

describe("merging duplicate listings", () => {
  const base = { title: "Data Engineer", company: "Acme", location: "Ottawa, ON" };

  it("merges the same posting from different boards and keeps the most complete one", () => {
    const thin = makeJob({ id: "a", ...base, salary: null, applyUrl: null, description: "short" });
    const rich = makeJob({ id: "b", ...base, company: "Acme Inc.", title: "Data Engineer (Hybrid)", description: "x".repeat(2000) });
    const merged = mergeDuplicates([thin, rich]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("b");
    expect(merged[0].duplicateCount).toBe(1);
  });

  it("carries over a stated salary that the kept listing lacks, and remembers the other apply link", () => {
    const salary = { min: 100_000, max: 120_000, currency: "CAD" as const, period: "year" as const, estimated: false };
    const withLink = makeJob({ id: "a", ...base, salary: null, applyUrl: "https://a.example/apply", description: "x".repeat(3000) });
    const withPay = makeJob({ id: "b", ...base, salary, applyUrl: "https://b.example/apply", description: "short" });
    const [m] = mergeDuplicates([withLink, withPay]);
    expect(m.salary).toEqual(salary);
    expect(m.otherApplyUrls).toEqual(expect.arrayContaining(["https://a.example/apply", "https://b.example/apply"].filter((u) => u !== m.applyUrl)));
  });

  it("never replaces a stated salary with an estimated one", () => {
    const stated = { min: 100_000, max: 120_000, currency: "CAD" as const, period: "year" as const, estimated: false };
    const guess = { ...stated, min: 200_000, max: 300_000, estimated: true };
    const [m] = mergeDuplicates([makeJob({ id: "a", ...base, salary: stated }), makeJob({ id: "b", ...base, salary: guess })]);
    expect(m.salary).toEqual(stated);
  });

  it("does not merge different cities, different levels or unknown employers", () => {
    const jobs = [
      makeJob({ id: "1", ...base }),
      makeJob({ id: "2", ...base, location: "Toronto, ON" }),
      makeJob({ id: "3", ...base, title: "Senior Data Engineer" }),
      makeJob({ id: "4", ...base, company: "Company not listed" }),
      makeJob({ id: "5", ...base, company: "Company not listed" }),
    ];
    expect(mergeDuplicates(jobs)).toHaveLength(5);
  });

  it("drops an exact repeat of the same id and keeps the order of first appearance", () => {
    const a = makeJob({ id: "a", ...base });
    const b = makeJob({ id: "b", ...base, company: "Globex" });
    expect(mergeDuplicates([a, b, a]).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("does not alter dates or descriptions", () => {
    const a = makeJob({ id: "a", ...base, postedAt: "2026-11-01T00:00:00Z", description: "x".repeat(3000) });
    const b = makeJob({ id: "b", ...base, postedAt: "2026-11-20T00:00:00Z", description: "y" });
    const [m] = mergeDuplicates([a, b]);
    expect(m.postedAt).toBe("2026-11-01T00:00:00Z");
    expect(m.description).toBe(a.description);
  });
});

describe("freshness", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it.each([
    [0, "new", "Posted today"],
    [1, "new", "Posted 1 day ago"],
    [5, "recent", "Posted 5 days ago"],
    [20, "aging", "Posted 20 days ago"],
    [45, "stale", "Posted 45 days ago"],
  ])("%i days old", (d, level, label) => {
    const f = freshness(ago(d), now);
    expect(f.level).toBe(level);
    expect(f.label).toBe(label);
  });

  it("warns that a stale posting may be closed, without claiming it is", () => {
    const f = freshness(ago(45), now);
    expect(f.note).toMatch(/may no longer be open/);
    expect(f.note).not.toMatch(/is closed|has closed/);
    expect(freshness(ago(5), now).note).toBeNull();
  });

  it("never guesses a missing or invalid date", () => {
    expect(freshness(null, now)).toMatchObject({ level: "unknown", days: null, label: "Date not listed" });
    expect(freshness("not a date", now).level).toBe("unknown");
  });

  it("treats a date in the future as today rather than negative", () => {
    expect(freshness(new Date(now.getTime() + 3 * 86_400_000).toISOString(), now).days).toBe(0);
  });
});

describe("level a posting asks for", () => {
  it.each([
    ["Junior Data Analyst", "", "Entry or junior"],
    ["Data Engineer", "Requires 3+ years of experience", "Mid-level"],
    ["Senior Data Engineer", "", "Senior"],
    ["Data Engineer", "7+ years of experience required", "Senior"],
    ["Lead Data Engineer", "", "Lead or above"],
    ["Principal Architect", "", "Lead or above"],
    ["Data Engineer", "Join our team", "Not stated"],
  ])("%s / %s", (title, description, expected) => {
    expect(levelBucket({ title, description })).toBe(expected);
  });
});
