import { describe, expect, it } from "vitest";
import { heuristicProfile } from "@/lib/heuristics";
import {
  normalizeDate,
  parseCertifications,
  parseEducation,
  parseWorkHistory,
  splitSections,
  verifyAgainstResume,
  yearsFromHistory,
  fillStructure,
  lacksStructure,
} from "@/lib/resume-sections";

const RESUME = `Jordan Lee
Ottawa, ON | jordan@example.com

Summary
Senior data engineer with a decade of experience.

Experience
Senior Data Engineer, Rideau Bank (Mar 2019 - Present)
- Built ETL pipelines between 2020 and 2022 that load a Snowflake warehouse for a retail bank across five regions.
- Delivered Power BI dashboards.

Capital Insurance - Data Analyst | Jun 2015 to Feb 2019
- Wrote SQL Server and SSIS reporting.

Education
B.Sc. Computer Science, Carleton University, 2015
Diploma in Business Analytics
Algonquin College 2013

Certifications
- Microsoft Certified: Azure Data Engineer Associate (DP-203)
- PMP

Skills
Python, SQL, Azure`;

describe("sections", () => {
  it("splits a resume at its headings", () => {
    const s = splitSections(RESUME);
    expect(s.experience.length).toBeGreaterThan(3);
    expect(s.education[0]).toMatch(/Carleton/);
    expect(s.certifications).toHaveLength(2);
    expect(s.skills).toEqual(["Python, SQL, Azure"]);
  });
});

describe("dates", () => {
  it.each([
    ["Mar 2019", "2019-03"],
    ["March 2019", "2019-03"],
    ["03/2019", "2019-03"],
    ["Sept. 2021", "2021-09"],
    ["2019", "2019"],
    ["last year", null],
  ])("%s", (raw, expected) => expect(normalizeDate(raw)).toBe(expected));
});

describe("work history", () => {
  const history = parseWorkHistory(RESUME);

  it("reads each job with title, company and dates", () => {
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ title: "Senior Data Engineer", company: "Rideau Bank", start: "2019-03", end: null, current: true });
    expect(history[1]).toEqual({ title: "Data Analyst", company: "Capital Insurance", start: "2015-06", end: "2019-02", current: false });
  });

  it("does not mistake a bullet that mentions two years for a job", () => {
    expect(history.some((h) => h.start === "2020")).toBe(false);
  });

  it("reads a job whose dates sit on their own line", () => {
    const text = "Experience\nAcme Corp\nSoftware Developer\n2018 - 2021\n- Built things";
    expect(parseWorkHistory(text)).toEqual([{ title: "Software Developer", company: "Acme Corp", start: "2018", end: "2021", current: false }]);
  });

  it("returns nothing, rather than guessing, when there are no dates", () => {
    expect(parseWorkHistory("Experience\nI worked at some places doing data work.")).toEqual([]);
  });
});

describe("years of experience from history", () => {
  const now = new Date("2026-11-22");
  it("counts overlapping jobs once", () => {
    expect(
      yearsFromHistory(
        [
          { title: "A", company: "x", start: "2015", end: "2019", current: false },
          { title: "B", company: "y", start: "2018", end: "2020", current: false },
        ],
        now,
      ),
    ).toBe(5);
  });
  it("counts a current job up to today", () => {
    expect(yearsFromHistory([{ title: "A", company: "x", start: "2019-03", end: null, current: true }], now)).toBe(8);
  });
  it("is null with no dated jobs", () => {
    expect(yearsFromHistory([], now)).toBeNull();
    expect(yearsFromHistory([{ title: "A", company: "x", start: null, end: null, current: false }], now)).toBeNull();
  });
});

describe("education", () => {
  it("reads credential, school and year, including a school on the next line", () => {
    const e = parseEducation(RESUME);
    expect(e[0]).toEqual({ credential: "B.Sc. Computer Science", institution: "Carleton University", year: "2015" });
    expect(e[1]).toEqual({ credential: "Diploma in Business Analytics", institution: "Algonquin College", year: "2013" });
  });
});

describe("certifications", () => {
  it("reads the certifications section and known certificate names", () => {
    const c = parseCertifications(RESUME);
    expect(c).toContain("Microsoft Certified: Azure Data Engineer Associate (DP-203)");
    expect(c).toContain("PMP");
  });
  it("finds a certificate named in running text but ignores the word certified in a bullet", () => {
    const c = parseCertifications("Experience\n- Led the certified release process for the team.\nHolds AWS Certified Solutions Architect.");
    expect(c.join(" ")).toMatch(/AWS Certified Solutions Architect/);
    expect(c.join(" ")).not.toMatch(/release process/);
  });
});

describe("headings that carry their content on one line", () => {
  const text = "Certifications\n- PMP\n- Microsoft Certified: Power BI Data Analyst Associate (PL-300)\nSkills: Power BI, DAX, SQL, SQL Server, SSRS, Excel";

  it("ends the previous section and starts skills", () => {
    const s = splitSections(text);
    expect(s.certifications).toEqual(["- PMP", "- Microsoft Certified: Power BI Data Analyst Associate (PL-300)"]);
    expect(s.skills).toEqual(["Power BI, DAX, SQL, SQL Server, SSRS, Excel"]);
  });

  it("keeps a skills line out of the certifications", () => {
    expect(parseCertifications(text).join(" ")).not.toMatch(/DAX/);
  });

  it("lists a certificate once, keeping the fullest form", () => {
    const c = parseCertifications(text);
    expect(c.filter((x) => /Power BI Data Analyst/.test(x))).toEqual(["Microsoft Certified: Power BI Data Analyst Associate (PL-300)"]);
    expect(c).toContain("PMP");
  });

  it("does not treat an ordinary sentence with a colon as a heading", () => {
    const s = splitSections("Experience\nNote: this role included skills work\nSenior Developer, Acme (2019 - 2021)");
    expect(s.experience).toHaveLength(2);
  });
});

describe("keeping Claude honest", () => {
  it("drops jobs, schools and certificates that are not in the resume", () => {
    const kept = verifyAgainstResume(
      {
        work: [
          { title: "Senior Data Engineer", company: "Rideau Bank", start: "2019", end: null, current: true },
          { title: "CTO", company: "Google", start: "2010", end: "2015", current: false },
        ],
        education: [
          { credential: "B.Sc.", institution: "Carleton University", year: "2015" },
          { credential: "PhD", institution: "MIT", year: "2020" },
        ],
        certifications: ["PMP", "CISSP", "Microsoft Certified: Azure Data Engineer Associate"],
      },
      RESUME,
    );
    expect(kept.work.map((w) => w.company)).toEqual(["Rideau Bank"]);
    expect(kept.education.map((e) => e.institution)).toEqual(["Carleton University"]);
    expect(kept.certifications).toEqual(["PMP", "Microsoft Certified: Azure Data Engineer Associate"]);
  });
});

describe("keyword profile", () => {
  it("includes the structured sections and uses listed titles first", () => {
    const p = heuristicProfile(RESUME);
    expect(p.workHistory).toHaveLength(2);
    expect(p.detectedRoles.slice(0, 2)).toEqual(["Senior Data Engineer", "Data Analyst"]);
    expect(p.education).toHaveLength(2);
    expect(p.certifications!.length).toBeGreaterThan(0);
    expect(p.yearsOfExperience).toBeGreaterThanOrEqual(10);
  });
});

describe("filling in profiles saved before these sections existed", () => {
  const old = heuristicProfile("Senior Data Engineer 9 years of experience. Python, SQL.");
  const legacy = { ...old, workHistory: undefined, education: undefined, certifications: undefined, skills: { ...old.skills, tools: ["Only this tool"] }, yearsOfExperience: 7 };

  it("recognises an old profile", () => {
    expect(lacksStructure(legacy)).toBe(true);
    expect(lacksStructure(heuristicProfile(RESUME))).toBe(false);
  });

  it("adds the missing sections from the resume and changes nothing else", () => {
    const filled = fillStructure(legacy, RESUME);
    expect(filled.workHistory).toHaveLength(2);
    expect(filled.education).toHaveLength(2);
    expect(filled.certifications!.length).toBeGreaterThan(0);
    expect(filled.skills).toEqual(legacy.skills);
    expect(filled.yearsOfExperience).toBe(7);
    expect(filled.detectedRoles).toEqual(legacy.detectedRoles);
  });

  it("never overwrites sections the user already has, even empty ones", () => {
    const edited = { ...legacy, workHistory: [], education: [{ credential: "Mine", institution: "Mine U", year: null }], certifications: [] };
    const filled = fillStructure(edited, RESUME);
    expect(filled.workHistory).toEqual([]);
    expect(filled.education).toEqual(edited.education);
    expect(filled.certifications).toEqual([]);
    expect(lacksStructure(filled)).toBe(false);
  });
});
