/** Invented postings for the developer candidate. Labels were written before the engine was run on them. */
import type { Scenario } from "@/lib/benchmark/types";

const about = "\n\nAbout us: we are a product company with hybrid working, mentoring and a pragmatic engineering culture that ships small changes often and fixes what it breaks.";
const make = (s: Omit<Scenario, "candidate">): Scenario => ({ candidate: "developer", ...s, description: s.description + about });

export const DEVELOPER_SCENARIOS: Scenario[] = [
  make({
    id: "dv-01", category: "Senior .NET Developer", kind: "direct", title: "Senior .NET Developer",
    description: `Responsibilities:
- Design Web APIs and services in C# backed by SQL Server.
- Review code and mentor developers.
Requirements:
- 6+ years of experience in software development.
- C#.
- .NET.
- REST APIs.
- SQL Server.
Nice to have:
- Azure`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["C#", ".NET", "REST APIs", "SQL Server"], evidence: { "C#": "professional", ".NET": "professional" } },
  }),
  make({
    id: "dv-02", category: "Azure Cloud Developer", kind: "strong_some_missing", title: "Azure Developer",
    description: `Responsibilities:
- Build and deploy cloud services and APIs on Azure.
- Maintain CI/CD pipelines.
Requirements:
- C#.
- Azure.
- Azure DevOps.
- REST APIs.
- Cosmos DB.`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["C#", "Azure", "Azure DevOps", "REST APIs", "Cosmos DB"], notMatched: ["Cosmos DB"] },
  }),
  make({
    id: "dv-03", category: "Power Platform Developer", kind: "learning_only", title: "Power Platform Developer",
    description: `Responsibilities:
- Build Power Apps and Power Automate solutions for business teams.
Requirements:
- Power Apps.
- Power Automate.
- SharePoint.
Nice to have:
- C#`,
    expect: { tier: "consider", eligibility: "not_applicable", required: ["Power Apps", "Power Automate", "SharePoint"], notMatched: ["SharePoint"], evidence: { "Power Apps": "project", "Power Automate": "project" } },
  }),
  make({
    id: "dv-04", category: "DevOps Engineer", kind: "learning_only", title: "DevOps Engineer",
    description: `Responsibilities:
- Run Kubernetes clusters and infrastructure as code, and be on call.
Requirements:
- Kubernetes.
- Terraform.
- Linux.
- Docker.
- CI/CD.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Kubernetes", "Terraform", "Linux", "Docker", "CI/CD"], notMatched: ["Linux"], evidence: { Kubernetes: "learning", Terraform: "learning", Docker: "listed" } },
  }),
  make({
    id: "dv-05", category: "Software Engineer", kind: "transferable", title: "Software Engineer",
    description: `Responsibilities:
- Build backend services and APIs.
Requirements:
- Java.
- Spring Boot.
- PostgreSQL.
- REST APIs.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Java", "Spring Boot", "PostgreSQL", "REST APIs"], notMatched: ["Java", "Spring Boot", "PostgreSQL"] },
  }),
  make({
    id: "dv-06", category: "Software Engineer", kind: "adjacent_professional", title: "Full Stack Developer",
    description: `Responsibilities:
- Build web applications with a .NET API and a React front end.
Requirements:
- C#.
- .NET.
- React.
- TypeScript.
- SQL.`,
    expect: { tier: "consider", eligibility: "not_applicable", required: ["C#", ".NET", "React", "TypeScript", "SQL"], evidence: { React: "project", TypeScript: "project" } },
  }),
  make({
    id: "dv-07", category: "Data Engineer", kind: "career_transition", title: "Data Engineer",
    description: `Responsibilities:
- Build data pipelines into the warehouse and model data.
Requirements:
- SQL.
- Python.
- ETL.
- Azure Data Factory.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["SQL", "Python", "ETL", "Azure Data Factory"], notMatched: ["ETL", "Azure Data Factory"], evidence: { Python: "listed" } },
  }),
  make({
    id: "dv-08", category: "AI/ML Engineer", kind: "keyword_overlap", title: "AI Engineer",
    description: `Responsibilities:
- Fine-tune and evaluate large language models and build retrieval systems.
Requirements:
- Python.
- PyTorch.
- LLMs.
- Azure.
- Git.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Python", "PyTorch", "LLMs", "Azure", "Git"], notMatched: ["PyTorch", "LLMs"] },
  }),
  make({
    id: "dv-09", category: "Software Engineer", kind: "wrong_specialization", title: "Embedded Firmware Engineer",
    description: `Responsibilities:
- Write firmware and device drivers for microcontrollers.
Requirements:
- C++.
- Git.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["C++", "Git"], notMatched: ["C++"] },
  }),
  make({
    id: "dv-10", category: "Senior .NET Developer", kind: "seniority_mismatch", title: "Principal .NET Architect",
    description: `Responsibilities:
- Set architecture direction across many teams.
Requirements:
- 15+ years of experience.
- C#.
- .NET.
- Azure.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["C#", ".NET", "Azure"] },
  }),
  make({
    id: "dv-11", category: "Senior .NET Developer", kind: "location_mismatch", title: "Senior .NET Developer", location: "Vancouver, BC", workMode: "On-site",
    description: `Responsibilities:
- Build services in C#. This role is on-site in Vancouver.
Requirements:
- C#.
- .NET.
- SQL Server.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["C#", ".NET", "SQL Server"] },
  }),
  make({
    id: "dv-12", category: "Senior .NET Developer", kind: "work_authorization", title: "Senior .NET Developer", facts: { workAuthorization: "needs_sponsorship" },
    description: `Responsibilities:
- Build Web APIs in C#.
Requirements:
- C#.
- .NET.
- We are unable to offer visa sponsorship.`,
    expect: { tier: "no", eligibility: "not_eligible", required: ["C#", ".NET"] },
  }),
  make({
    id: "dv-13", category: "Software Engineer", kind: "missing_mandatory", title: "Software Developer",
    description: `Responsibilities:
- Build business applications.
Requirements:
- C#.
- SQL.
- A Bachelor's degree in Computer Science is required.`,
    expect: { tier: "consider", eligibility: "needs_verification", required: ["C#", "SQL"], missingQualifications: ["Bachelor's degree"] },
  }),
  make({
    id: "dv-14", category: "Software Engineer", kind: "direct", title: "Software Developer",
    description: `Responsibilities:
- Build REST APIs for business applications.
Requirements:
- C#.
- SQL.
- Bachelor's degree in Computer Science or equivalent experience.`,
    expect: { tier: "apply", eligibility: "eligible", required: ["C#", "SQL"] },
  }),
  make({
    id: "dv-15", category: "Azure Cloud Developer", kind: "missing_certification", title: "Azure Cloud Developer",
    description: `Responsibilities:
- Deploy and operate Azure services.
Requirements:
- Azure.
- C#.
- Azure DevOps.
- Candidates must hold an active AZ-204 Azure Developer Associate certification.`,
    expect: { tier: "consider", eligibility: "needs_verification", required: ["Azure", "C#", "Azure DevOps"], missingQualifications: ["AZ-204"] },
  }),
  make({
    id: "dv-16", category: "Azure Cloud Developer", kind: "missing_certification", title: "Azure Developer",
    description: `Responsibilities:
- Build APIs on Azure.
Requirements:
- C#.
- Azure.
- REST APIs.
Nice to have:
- AZ-204 certification is an asset.`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["C#", "Azure", "REST APIs"] },
  }),
  make({
    id: "dv-17", category: "Senior .NET Developer", kind: "incomplete", title: "Senior Developer", truncated: true,
    description: "Great opportunity for a senior developer. C# an advantage. Apply today.",
    expect: { tier: "consider", eligibility: "not_applicable", required: [] },
  }),
  make({
    id: "dv-18", category: "Senior .NET Developer", kind: "expired", title: "Senior .NET Developer",
    description: `Applications are now closed for this competition.
Requirements:
- C#.
- .NET.
- SQL Server.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["C#", ".NET", "SQL Server"] },
  }),
  make({
    id: "dv-19", category: "Software Engineer", kind: "ambiguous", title: "Developer",
    description: "We are looking for a builder. Some days that is C#, some days it is a spreadsheet, and occasionally it is talking a customer through a problem on the phone.",
    expect: { tier: "consider", eligibility: "not_applicable", required: [] },
  }),
];
