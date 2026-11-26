/**
 * Labelled, anonymized fixtures for the matching engine. The candidate is fictional: an integration and
 * C#/.NET developer. None of this is real personal data.
 */
import type { CandidateProfile } from "@/types/job";
import type { MatchableJob } from "@/lib/matching/engine";

export const CANDIDATE_RESUME = `Alex Rivera
Toronto, ON

Summary
Senior integration developer with 10 years of experience in HR systems, C# and SQL Server.

Experience
Senior Integration Developer, Northfield University (2017 - 2025)
- Built Workday Studio and Core Connector integrations exchanging HR and payroll data with downstream systems.
- Developed C# and ASP.NET Web API services backed by SQL Server stored procedures for HR data.
- Led a team of 4 developers and coordinated releases with HR stakeholders.
- Tuned T-SQL queries and built SSIS packages for nightly data integration.
Software Developer, Lakeshore Insurance (2013 - 2017)
- Developed C# .NET applications and REST APIs for insurance claims processing.
- Wrote SQL Server reporting and data integration jobs for the claims team.

Projects
- Built a personal expense tracker in React and TypeScript.

Education
B.Sc. Computer Science, Example University, 2012

Certifications
- Microsoft Azure Fundamentals (in progress)

Skills: C#, .NET, SQL Server, T-SQL, SSIS, Azure, Python, Java, Git, REST APIs, React, TypeScript`;

export const CANDIDATE: CandidateProfile = {
  summary: "Senior integration developer with 10 years of experience in HR systems, C# and SQL Server.",
  yearsOfExperience: 10,
  seniority: "Senior",
  skills: {
    languages: ["C#", "T-SQL", "Python", "Java", "TypeScript"],
    frameworks: [".NET", "REST APIs", "React"],
    cloudData: ["SQL Server", "SSIS", "Azure"],
    tools: ["Git"],
  },
  detectedRoles: ["Senior Integration Developer", "Software Developer"],
  recommendedRoles: ["Integration Developer", "Senior .NET Developer"],
  source: "heuristic",
};

export const CANDIDATE_PREFS = {
  locations: ["Greater Toronto Area, ON", "Remote - Canada"],
  minSalary: 100_000,
  roles: ["Integration Developer", "Senior .NET Developer", "Senior Software Developer"],
  primaryRoles: ["Integration Developer", "Senior .NET Developer"],
  secondaryRoles: ["Senior Software Developer"],
};

const base = (over: Partial<MatchableJob>): MatchableJob => ({
  title: "Developer",
  description: "",
  location: "Toronto, ON",
  workMode: "Hybrid",
  salary: null,
  descriptionTruncated: false,
  ...over,
});

const FILLER = "\nAbout us: we are a growing team with a learning budget, flexible hours and a collaborative culture. ".repeat(8);

export interface Scenario {
  id: string;
  label: string;
  /** What a careful human reviewer would conclude. */
  expect: string;
  job: MatchableJob;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "A",
    label: "Strong direct match, Python only listed",
    expect: "High score; Python flagged as a gap because no work using it is shown",
    job: base({
      title: "Senior Integration Developer",
      description: `Responsibilities:
- Design and build integrations and REST APIs between our HR and payroll systems.
- Develop C# and .NET services backed by SQL Server stored procedures.
- Work with HR stakeholders on requirements and coordinate releases.
Requirements:
- 7+ years of experience in software development.
- Strong C#, .NET and SQL Server.
- Experience building REST APIs.
- Python for scripting.
Nice to have:
- Workday integrations
- Azure${FILLER}`,
    }),
  },
  {
    id: "B",
    label: "Transferable but not equivalent",
    expect: "Related-technology credit with an explanation, lower than a direct match; not counted as matched",
    job: base({
      title: "Senior Cloud Data Integration Developer",
      description: `Responsibilities:
- Build data integration pipelines and orchestrate data movement in the cloud.
- Maintain Azure SQL databases and tune queries.
Requirements:
- 5+ years of experience in data integration.
- Azure SQL
- Azure Data Factory
- T-SQL${FILLER}`,
    }),
  },
  {
    id: "C",
    label: "Keyword overlap, poor responsibility fit",
    expect: "Skills overlap but the work is different; score held down",
    job: base({
      title: "Senior Gameplay Programmer",
      description: `Responsibilities:
- Build gameplay systems, 3D rendering features, physics and animation for our console titles.
- Optimize frame rate and GPU performance; prototype game mechanics with designers.
Requirements:
- 5+ years of experience in game development.
- C# and .NET
- SQL
- Git${FILLER}`,
    }),
  },
  {
    id: "D",
    label: "Seniority mismatch",
    expect: "Role far below the candidate's level; flagged and held down",
    job: base({
      title: "Junior .NET Developer",
      description: `Responsibilities:
- Develop C# .NET applications and REST APIs under guidance from senior developers.
Requirements:
- 0-2 years of experience.
- C#, .NET and SQL Server.${FILLER}`,
    }),
  },
  {
    id: "E",
    label: "Confirmed not eligible",
    expect: "Posting requires citizenship and the candidate declared a work permit: not_eligible, excluded",
    job: base({
      title: "Senior .NET Developer",
      description: `Responsibilities:
- Develop C# .NET applications and REST APIs for a federal department.
Requirements:
- 7+ years of experience.
- C#, .NET and SQL Server.
- Applicants must be Canadian citizens.${FILLER}`,
    }),
  },
  {
    id: "F",
    label: "Unknown eligibility",
    expect: "Posting requires a Secret clearance and the candidate has said nothing: needs_verification, never not_eligible",
    job: base({
      title: "Senior Integration Developer",
      description: `Responsibilities:
- Build integrations and REST APIs in C# and .NET.
Requirements:
- 7+ years of experience.
- C#, .NET and SQL Server.
- Must hold or be able to obtain a Secret security clearance.${FILLER}`,
    }),
  },
  {
    id: "G",
    label: "Thin posting",
    expect: "Low confidence, no invented requirements",
    job: base({ title: "Developer", description: "Developer needed. Apply today.", descriptionTruncated: true }),
  },
];
