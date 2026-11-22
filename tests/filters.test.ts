import { describe, expect, it } from "vitest";
import { applyFilters, countriesFor, employmentMatches, inferEmploymentType, inferWorkMode } from "@/lib/providers/common";
import { DEFAULT_FILTERS, type SearchFilters } from "@/types/job";
import { makeJob } from "./helpers";

const filters = (over: Partial<SearchFilters> = {}): SearchFilters => ({ ...DEFAULT_FILTERS, ...over });

describe("employment type inference", () => {
  it.each([
    ["Data Engineer (6-month contract)", "", "Contract"],
    ["Data Engineer", "This is a temporary role.", "Contract"],
    ["Freelance BI Developer", "", "Contract"],
    ["Data Analyst", "Part-time, 20 hours a week", "Part-time"],
    ["Data Engineering Intern", "", "Internship"],
    ["Data Engineer", "A permanent, full-time position.", "Full-time"],
    ["Data Engineer", "Join our team.", "Not stated"],
  ])("%s / %s -> %s", (title, description, expected) => {
    expect(inferEmploymentType(title, description)).toBe(expected);
  });
});

describe("permanent full-time filter (the default)", () => {
  it("is the default employment filter", () => {
    expect(DEFAULT_FILTERS.employmentType).toBe("Permanent full-time");
  });

  it("keeps full-time and unstated, and excludes contract, part-time and internship", () => {
    const jobs = [
      makeJob({ id: "ft", employmentType: "Full-time" }),
      makeJob({ id: "ns", employmentType: "Not stated" }),
      makeJob({ id: "ct", employmentType: "Contract" }),
      makeJob({ id: "pt", employmentType: "Part-time" }),
      makeJob({ id: "in", employmentType: "Internship" }),
    ];
    expect(applyFilters(jobs, filters()).map((j) => j.id)).toEqual(["ft", "ns"]);
  });

  it("employmentMatches handles each filter value", () => {
    expect(employmentMatches({ employmentType: "Contract" }, "All")).toBe(true);
    expect(employmentMatches({ employmentType: "Contract" }, "Contract")).toBe(true);
    expect(employmentMatches({ employmentType: "Full-time" }, "Contract")).toBe(false);
    expect(employmentMatches({ employmentType: "Not stated" }, "Contract")).toBe(true);
  });
});

describe("salary filter", () => {
  const f = filters({ minSalary: 100_000 });
  const salary = (min: number | null, max: number | null, over = {}) => ({
    min,
    max,
    currency: "CAD" as const,
    period: "year" as const,
    estimated: false,
    ...over,
  });

  it("excludes jobs that state a salary below the minimum", () => {
    expect(applyFilters([makeJob({ salary: salary(70_000, 90_000) })], f)).toHaveLength(0);
  });
  it("keeps a range that reaches the minimum", () => {
    expect(applyFilters([makeJob({ salary: salary(90_000, 105_000) })], f)).toHaveLength(1);
  });
  it("keeps jobs with no salary", () => {
    expect(applyFilters([makeJob({ salary: null })], f)).toHaveLength(1);
  });
  it("never excludes on a salary the provider only estimated", () => {
    expect(applyFilters([makeJob({ salary: salary(60_000, 70_000, { estimated: true }) })], f)).toHaveLength(1);
  });
  it("converts hourly pay to a yearly figure", () => {
    const low = makeJob({ id: "low", salary: salary(30, 40, { period: "hour" }) }); // about 83k a year
    const high = makeJob({ id: "high", salary: salary(55, 70, { period: "hour" }) }); // about 146k a year
    expect(applyFilters([low, high], f).map((j) => j.id)).toEqual(["high"]);
  });
  it("applies no limit when the minimum is empty", () => {
    expect(applyFilters([makeJob({ salary: salary(30_000, 40_000) })], filters({ minSalary: null }))).toHaveLength(1);
  });
});

describe("work mode filter", () => {
  const jobs = [
    makeJob({ id: "r", workMode: "Remote" }),
    makeJob({ id: "h", workMode: "Hybrid" }),
    makeJob({ id: "o", workMode: "On-site" }),
    makeJob({ id: "n", workMode: "Not stated" }),
  ];
  it("filters Remote and Hybrid strictly", () => {
    expect(applyFilters(jobs, filters({ workMode: "Remote" })).map((j) => j.id)).toEqual(["r"]);
    expect(applyFilters(jobs, filters({ workMode: "Hybrid" })).map((j) => j.id)).toEqual(["h"]);
  });
  it("treats an unstated work mode as On-site", () => {
    expect(applyFilters(jobs, filters({ workMode: "On-site" })).map((j) => j.id)).toEqual(["o", "n"]);
  });
  it("infers work mode from text", () => {
    expect(inferWorkMode("Data Engineer (Hybrid)", "")).toBe("Hybrid");
    expect(inferWorkMode("Data Engineer", "Work from home anywhere in Canada")).toBe("Remote");
    expect(inferWorkMode("Data Engineer", "Nothing about location")).toBe("Not stated");
  });
});

describe("location to country", () => {
  it.each([
    ["Ottawa, ON", ["ca"]],
    ["Greater Toronto Area, ON", ["ca"]],
    ["Gatineau, QC", ["ca"]],
    ["Remote - Canada", ["ca"]],
    ["Remote - Anywhere", ["ca", "us"]],
    ["Austin, TX", ["us"]],
  ])("%s", (location, expected) => {
    expect(countriesFor(location)).toEqual(expected);
  });
});
