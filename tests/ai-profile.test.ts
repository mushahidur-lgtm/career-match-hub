import { describe, expect, it } from "vitest";
import { buildProfileFromAi, trustedYears, type AiProfileData } from "@/lib/ai-profile";
import { heuristicProfile } from "@/lib/heuristics";

const RESUME = `Jordan Lee
Experience
Senior Data Engineer, Rideau Bank (Mar 2019 - Present)
- Built ETL pipelines.
Data Analyst, Capital Insurance (Jun 2015 - Feb 2019)
- SQL Server reporting.
Education
B.Sc. Computer Science, Carleton University, 2015
Certifications
- PMP
Skills
Python, SQL`;

const fallback = heuristicProfile(RESUME);
const base: AiProfileData = {
  summary: "Senior data engineer.",
  yearsOfExperience: null,
  seniority: "Senior",
  skills: { languages: ["Python", "python", "SQL"], frameworks: [], cloudData: [], tools: [] },
  detectedRoles: ["Data Engineer"],
  recommendedRoles: ["Senior Data Engineer"],
  workHistory: [
    { title: "Senior Data Engineer", company: "Rideau Bank", start: "2019-03", end: null, current: true },
    { title: "Data Analyst", company: "Capital Insurance", start: "2015-06", end: "2019-02", current: false },
  ],
  education: [{ credential: "B.Sc. Computer Science", institution: "Carleton University", year: "2015" }],
  certifications: ["PMP"],
};

describe("building a profile from Claude's answer", () => {
  it("keeps what the resume contains and works out years from the dated history", () => {
    const p = buildProfileFromAi(base, RESUME, fallback, "m");
    expect(p.source).toBe("ai");
    expect(p.workHistory).toHaveLength(2);
    expect(p.education).toHaveLength(1);
    expect(p.certifications).toEqual(["PMP"]);
    expect(p.yearsOfExperience).toBeGreaterThanOrEqual(10);
    expect(p.skills.languages).toEqual(["Python", "SQL"]);
    expect(p.detectedRoles.slice(0, 2)).toEqual(["Senior Data Engineer", "Data Analyst"]);
  });

  it("drops an employer, school and certificate the resume does not contain", () => {
    const p = buildProfileFromAi(
      {
        ...base,
        workHistory: [...base.workHistory, { title: "CTO", company: "Google", start: "2010", end: "2014", current: false }],
        education: [...base.education, { credential: "PhD", institution: "MIT", year: "2020" }],
        certifications: ["PMP", "CISSP"],
      },
      RESUME,
      fallback,
      "m",
    );
    expect(p.workHistory!.map((w) => w.company)).toEqual(["Rideau Bank", "Capital Insurance"]);
    expect(p.education!.map((e) => e.institution)).toEqual(["Carleton University"]);
    expect(p.certifications).toEqual(["PMP"]);
    expect(p.detectedRoles).not.toContain("CTO");
  });

  it("falls back to the keyword reading when everything Claude listed is invented", () => {
    const p = buildProfileFromAi({ ...base, workHistory: [{ title: "CTO", company: "Google", start: "2010", end: "2014", current: false }], education: [], certifications: [] }, RESUME, fallback, "m");
    expect(p.workHistory).toEqual(fallback.workHistory);
    expect(p.workHistory!.length).toBeGreaterThan(0);
  });

  it("rejects dates that are not YYYY or YYYY-MM", () => {
    const p = buildProfileFromAi({ ...base, workHistory: [{ title: "Data Analyst", company: "Capital Insurance", start: "last spring", end: "2019-13", current: false }] }, RESUME, fallback, "m");
    expect(p.workHistory![0].start).toBeNull();
    expect(p.workHistory![0].end).toBeNull();
  });

  it("prefers a stated number of years and ignores an impossible one", () => {
    expect(buildProfileFromAi({ ...base, yearsOfExperience: 9.4 }, RESUME, fallback, "m").yearsOfExperience).toBe(9);
    expect(buildProfileFromAi({ ...base, yearsOfExperience: 400 }, RESUME, fallback, "m").yearsOfExperience).toBeGreaterThanOrEqual(10);
  });
});

describe("details Claude cannot invent", () => {
  it("drops a job whose employer is real but whose title is not on the resume", () => {
    const p = buildProfileFromAi(
      { ...base, workHistory: [{ title: "Principal Architect", company: "Rideau Bank", start: "2008", end: null, current: true }, ...base.workHistory.slice(1)] },
      RESUME,
      fallback,
      "m",
    );
    expect(p.workHistory!.some((w) => w.title === "Principal Architect")).toBe(false);
    expect(p.detectedRoles).not.toContain("Principal Architect");
  });

  it("accepts a title written differently, such as Sr. for Senior", () => {
    const p = buildProfileFromAi({ ...base, workHistory: [{ title: "Sr. Data Engineer", company: "Rideau Bank", start: "2019-03", end: null, current: true }] }, RESUME, fallback, "m");
    expect(p.workHistory![0].title).toBe("Sr. Data Engineer");
  });

  it("clears a date whose year is not on the resume, but keeps the job", () => {
    const p = buildProfileFromAi({ ...base, workHistory: [{ title: "Data Analyst", company: "Capital Insurance", start: "2011-04", end: "2019-02", current: false }] }, RESUME, fallback, "m");
    expect(p.workHistory![0].start).toBeNull();
    expect(p.workHistory![0].end).toBe("2019-02");
  });

  it("clears a graduation year that is not on the resume", () => {
    const p = buildProfileFromAi({ ...base, education: [{ credential: "B.Sc. Computer Science", institution: "Carleton University", year: "2009" }] }, RESUME, fallback, "m");
    expect(p.education![0].year).toBeNull();
  });

  it("drops detected roles the resume does not support", () => {
    const p = buildProfileFromAi({ ...base, detectedRoles: ["Data Engineer", "Chief Technology Officer"] }, RESUME, fallback, "m");
    expect(p.detectedRoles).toContain("Data Engineer");
    expect(p.detectedRoles).not.toContain("Chief Technology Officer");
  });
});

describe("years of experience Claude claims", () => {
  it("accepts a figure the dated history supports", () => {
    expect(trustedYears(10, 11, "no stated years")).toBe(10);
  });
  it("accepts a figure the resume states itself", () => {
    expect(trustedYears(15, 11, "Over 15 years of experience in data")).toBe(15);
  });
  it("rejects an inflated figure that nothing on the resume backs", () => {
    expect(trustedYears(25, 11, "Senior engineer")).toBeNull();
  });
  it("is used end to end: an inflated claim falls back to the dated history", () => {
    const p = buildProfileFromAi({ ...base, yearsOfExperience: 25 }, RESUME, fallback, "m");
    expect(p.yearsOfExperience).toBeGreaterThanOrEqual(10);
    expect(p.yearsOfExperience).toBeLessThanOrEqual(12);
  });
  it("trusts a small claim when there is no dated history to compare", () => {
    expect(trustedYears(2, null, "Recent graduate")).toBe(2);
    expect(trustedYears(12, null, "Recent graduate")).toBeNull();
  });
  it("rejects impossible values", () => {
    expect(trustedYears(null, 5, "")).toBeNull();
    expect(trustedYears(-3, 5, "")).toBeNull();
    expect(trustedYears(400, 5, "")).toBeNull();
  });
});
