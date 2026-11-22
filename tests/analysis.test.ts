import { describe, expect, it } from "vitest";
import { estimateYears, heuristicMatch, heuristicProfile } from "@/lib/heuristics";
import { extractSkills, flattenSkills } from "@/lib/skills";
import { savedJobsToCsv, formatSalary } from "@/lib/format";
import { makeJob, makeSaved } from "./helpers";

describe("skill extraction", () => {
  const skills = (t: string) => flattenSkills(extractSkills(t));
  it("does not read Java inside JavaScript or C inside C++", () => {
    expect(skills("Built UIs in JavaScript")).toEqual(["JavaScript"]);
    expect(skills("Wrote systems code in C++")).toEqual(["C++"]);
  });
  it("only counts Go and R when they sit in a skills list", () => {
    expect(skills("I will go to the office and report results")).toEqual([]);
    expect(skills("Skills: Python, Go, R")).toEqual(expect.arrayContaining(["Python", "Go", "R"]));
  });
  it("matches spelling variants onto one name", () => {
    expect(skills("Used Postgres and NodeJS")).toEqual(expect.arrayContaining(["PostgreSQL", "Node.js"]));
  });
});

describe("experience estimate", () => {
  const now = new Date("2026-11-22");
  it("trusts a stated figure", () => {
    expect(estimateYears("Over 9 years of experience in data", now)).toBe(9);
  });
  it("adds date ranges and counts overlap once", () => {
    const text = "Engineer 2019 - Present\nContractor 2020 - 2021\nAnalyst 2015 - 2019";
    expect(estimateYears(text, now)).toBe(12);
  });
  it("ignores education dates", () => {
    const text = "Education\nB.Sc. Computer Science 2011 - 2015\n\nExperience\nEngineer 2019 - 2021";
    expect(estimateYears(text, now)).toBe(2);
  });
  it("returns null rather than guessing", () => {
    expect(estimateYears("No dates in this resume at all", now)).toBeNull();
  });
});

describe("profile and match scoring", () => {
  const profile = heuristicProfile(
    "Senior Data Engineer, 9 years of experience. Python, SQL, Azure Data Factory, Snowflake, Databricks, Airflow, Power BI.",
  );

  it("reads seniority and roles from the resume", () => {
    expect(profile.seniority).toBe("Senior");
    expect(profile.recommendedRoles.length).toBeGreaterThanOrEqual(5);
  });

  it("scores a strong fit higher than an unrelated job", () => {
    const fit = heuristicMatch({ title: "Senior Data Engineer", description: "Python, SQL, Azure Data Factory and Snowflake." }, profile);
    const other = heuristicMatch({ title: "Senior iOS Developer", description: "Swift, Kotlin and Flutter mobile apps." }, profile);
    expect(fit.score).toBeGreaterThan(other.score + 30);
    expect(fit.matchingSkills).toEqual(expect.arrayContaining(["Python", "SQL"]));
    expect(other.missingSkills).toEqual(expect.arrayContaining(["Swift"]));
  });

  it("does not mark a skill as matching when only the job asks for it", () => {
    const m = heuristicMatch({ title: "Data Engineer", description: "Requires Scala and Kafka." }, profile);
    expect(m.matchingSkills).not.toContain("Scala");
    expect(m.missingSkills).toContain("Scala");
  });
});

describe("csv export", () => {
  it("neutralises spreadsheet formulas and escapes quotes", () => {
    const job = makeJob({ title: '=HYPERLINK("http://x")', company: 'Acme, "Inc"' });
    const csv = savedJobsToCsv([makeSaved(job, { notes: "+1 call" })]);
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain('"Acme, ""Inc"""');
    expect(csv).toContain("\"'+1 call\"");
  });
  it("labels missing salaries as unknown", () => {
    expect(formatSalary(null)).toBe("Salary unknown");
  });
});
