/** Degree and certificate gates, and career alignment. */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/eligibility/engine";
import { qualificationRequirements } from "@/lib/eligibility/qualifications";
import { titleSimilarity, scoreJob } from "@/lib/matching/engine";
import { careerAlignment } from "@/lib/matching/career";
import { PreferencesSchema, ProfileSchema } from "@/lib/schemas";
import { toMatchInput } from "@/lib/search/match-input";
import { DEFAULT_PREFERENCES, type CandidateFacts, type CertificationDetail, type EducationEntry } from "@/types/job";
import { CANDIDATE, CANDIDATE_RESUME, SCENARIOS } from "./fixtures/matching-fixtures";

const NOW = new Date("2026-11-26T00:00:00Z");
const bsc: EducationEntry = { credential: "B.Sc. Computer Science", institution: "U", year: "2012" };
const diploma: EducationEntry = { credential: "College Diploma in Programming", institution: "C", year: "2015" };

const run = (line: string, over: { education?: EducationEntry[]; certifications?: CertificationDetail[]; years?: number | null } = {}, facts: CandidateFacts = {}) =>
  checkEligibility("Developer", `Requirements:\n- ${line}`, facts, { education: over.education ?? [], certifications: over.certifications ?? [], yearsOfExperience: over.years === undefined ? 8 : over.years }, NOW);
const complete = { qualificationsComplete: true };

describe("education", () => {
  it("reads level, field, preference and equivalence", () => {
    const [r] = qualificationRequirements("Bachelor's degree in Computer Science or equivalent experience is required.");
    expect(r).toMatchObject({ kind: "education", level: 3, field: "Computer Science", equivalentExperience: true, preferred: false, explicit: true });
    expect(qualificationRequirements("A Master's degree is preferred.")[0]).toMatchObject({ level: 4, preferred: true });
    expect(qualificationRequirements("No degree is required.")).toEqual([]);
  });
  it("is met by an equal or higher degree", () => {
    expect(run("Bachelor's degree required.", { education: [bsc] }).status).toBe("eligible");
  });
  it("is never failed for missing information", () => {
    expect(run("Bachelor's degree required.").status).toBe("needs_verification");
    expect(run("Bachelor's degree required.", { education: [diploma] }).status).toBe("needs_verification");
  });
  it("fails only when required, no alternative, and the list is declared complete", () => {
    expect(run("Bachelor's degree required.", { education: [diploma] }, complete).status).toBe("not_eligible");
    expect(run("Bachelor's degree.", { education: [diploma] }, complete).status).not.toBe("not_eligible");
  });
  it("counts equivalent experience where the employer allows it", () => {
    const line = "Bachelor's degree or equivalent experience required.";
    expect(run(line, { education: [diploma], years: 8 }, complete).status).toBe("eligible");
    expect(run(line, { education: [diploma], years: 1 }, complete).status).not.toBe("not_eligible");
  });
  it("only notes a missing preferred degree", () => {
    const r = run("A Master's degree is preferred.", { education: [bsc] }, complete);
    expect(r.checks[0].status).toBe("preferred_missing");
    expect(r.status).toBe("not_applicable");
  });
  it("does not move a job down for a weakly worded bullet", () => {
    const r = run("Bachelor's degree in Computer Science", { education: [] });
    expect(r.checks[0]).toMatchObject({ status: "needs_verification", advisory: true });
    expect(r.status).toBe("not_applicable");
  });
  it("shows the posting's words and what you entered", () => {
    const [c] = run("A Master's degree is required.", { education: [bsc] }).checks;
    expect(c.postingEvidence).toBe("A Master's degree is required.");
    expect(c.candidateEvidence).toMatch(/B\.Sc\. Computer Science/);
  });
});

describe("certifications", () => {
  const line = "An active AZ-204 certification is required.";
  const held = (over: Partial<CertificationDetail> = {}) => ({ certifications: [{ name: "Microsoft Certified: Azure Developer Associate", ...over }] });
  it("matches a certificate by its code or its title", () => {
    expect(run(line, held()).status).toBe("eligible");
  });
  it("is verified when unknown and failed only with a complete list", () => {
    expect(run(line).status).toBe("needs_verification");
    expect(run(line, {}, complete).status).toBe("not_eligible");
  });
  it("identifies an expired certificate without failing it", () => {
    const r = run(line, held({ expires: "2025-06" }), complete);
    expect(r.status).toBe("needs_verification");
    expect(r.reason).toMatch(/expired \(2025-06\)/);
  });
  it("does not count one still in progress", () => {
    expect(run(line, { certifications: [{ name: "AZ-204 (in progress)" }] }).status).toBe("needs_verification");
  });
  it("treats obtainable-after-hire and preferred differently from required", () => {
    expect(run("Must obtain the AZ-204 certification within 6 months of hire.", {}, complete).status).toBe("eligible");
    expect(run("PMP certification is an asset.", {}, complete).checks[0].status).toBe("preferred_missing");
  });
  it("shows a certificate it cannot name without moving the job", () => {
    for (const line of ["A forklift certification is required.", "A valid driver's licence is required.", "You must manage SSL certificates."]) {
      const r = run(line, {}, complete);
      expect(r.status, line).toBe("not_applicable");
      for (const c of r.checks) expect(c).toMatchObject({ status: "needs_verification", advisory: true });
    }
  });
  it("never reads a listed technology as a certificate", () => {
    const m = scoreJob({ ...SCENARIOS[0].job, description: `Requirements:\n- Azure\n- ${line}` }, { profile: CANDIDATE, resumeText: CANDIDATE_RESUME });
    expect(m.eligibility!.status).toBe("needs_verification");
  });
});

describe("career alignment", () => {
  const prefs = { primaryRoles: ["Senior .NET Developer"], secondaryRoles: ["Software Engineer"], transitionRoles: ["Data Engineer"], excludedRoles: ["Support Analyst"] };
  const align = (title: string, p = prefs) => careerAlignment({ title, description: "" }, p, [], titleSimilarity);
  it("separates direct, adjacent, transition and unrelated roles", () => {
    expect(align(".NET Developer").relation).toBe("direct");
    expect(align("Software Engineer").relation).toBe("adjacent");
    expect(align("Data Engineer")).toMatchObject({ relation: "transition", score: 65 });
    expect(align("Marketing Coordinator").relation).toBe("unrelated");
  });
  it("excludes a role you do not want, and caps its score", () => {
    expect(align("Support Analyst")).toMatchObject({ excludedRole: "Support Analyst", score: 0 });
    const m = scoreJob({ ...SCENARIOS[0].job, title: "Support Analyst" }, toMatchInput(CANDIDATE, CANDIDATE_RESUME, { ...DEFAULT_PREFERENCES, excludedRoles: ["Support Analyst"] }));
    expect(m.score).toBeLessThanOrEqual(50);
    expect(m.detail!.caps.join(" ")).toMatch(/which you excluded/);
  });
});

describe("stored data from before these fields", () => {
  it("still loads profiles and preferences, and keeps the new fields", () => {
    expect(ProfileSchema.parse(CANDIDATE)).toEqual(CANDIDATE);
    const profile = { ...CANDIDATE, education: [{ ...bsc, field: "Computer Science" }], certificationDetails: [{ name: "PMP", issuer: "PMI", expires: "2027" }] };
    expect(ProfileSchema.parse(profile)).toEqual(profile);
    const prefs = { ...DEFAULT_PREFERENCES, transitionRoles: ["Data Engineer"], excludedRoles: ["Sales"], facts: { qualificationsComplete: true } };
    expect(PreferencesSchema.parse(prefs)).toEqual(prefs);
    expect(PreferencesSchema.parse(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES);
  });
});
