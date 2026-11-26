/** Two invented candidates. Neither describes a real person. */
import type { BenchCandidate } from "@/lib/benchmark/types";

const analystResume = `Sam Okafor
Summary
Analytics developer with 7 years building reporting and data models.

Experience
Analytics Developer, Harbourline Logistics (2021 - Present)
- Built Power BI dashboards and semantic models with DAX for operations and finance teams.
- Developed Azure Synapse pipelines and transformations that load the reporting warehouse.
- Wrote T-SQL stored procedures and tuned SQL Server queries.
- Gathered requirements from stakeholders and trained report users.
Reporting Analyst, Bluewater Retail (2018 - 2021)
- Built SSIS packages and SSRS reports on SQL Server.
- Modelled dimensional data for sales analytics.

Projects
- Personal project: wrote Python and pandas scripts to analyse public transit data.

Training
- Currently learning Databricks and PySpark through an online course.

Education
Bachelor of Commerce in Information Systems, Lakeview University, 2018

Certifications
Microsoft Certified: Power BI Data Analyst Associate

Skills: Power BI, DAX, Power Query, SQL, T-SQL, SQL Server, SSIS, SSRS, Azure Synapse, Azure, Data modeling, ETL, Python, Pandas, Databricks, PySpark, Microsoft Fabric`;

const devResume = `Priya Menon
Summary
Software developer with 8 years in C# and .NET business applications.

Experience
Senior Software Developer, Northgate Benefits (2020 - Present)
- Designed ASP.NET Core Web API and MVC applications in C# backed by SQL Server.
- Built CI/CD pipelines in Azure DevOps and deployed services to Azure App Service.
- Integrated payroll and HR systems through REST APIs.
- Mentored two developers and reviewed code.
Software Developer, Copperfield Software (2017 - 2020)
- Developed C# .NET services and T-SQL reporting queries.
- Wrote unit tests and fixed production defects.

Projects
- Side project: built a React and TypeScript booking site.
- Personal project: built a Power Apps inspection form with Power Automate approvals.

Training
- Currently learning Kubernetes and Terraform.

Education
Diploma in Computer Programming, Riverside College, 2017

Skills: C#, .NET, REST APIs, SQL, SQL Server, T-SQL, Azure, Azure DevOps, CI/CD, Git, React, TypeScript, Power Apps, Power Automate, Kubernetes, Terraform, Docker, Python`;

export const CANDIDATES: BenchCandidate[] = [
  {
    id: "analyst",
    label: "Analytics and BI developer (invented)",
    education: [{ credential: "Bachelor of Commerce in Information Systems", institution: "Lakeview University", year: "2018" }],
    input: {
      resumeText: analystResume,
      profile: {
        summary: "Analytics developer with 7 years building reporting and data models.",
        yearsOfExperience: 7,
        seniority: "Mid-level",
        skills: {
          languages: ["SQL", "T-SQL", "DAX", "Python"],
          frameworks: ["Pandas", "PySpark"],
          cloudData: ["SQL Server", "SSIS", "SSRS", "Azure Synapse", "Azure", "Data modeling", "ETL", "Databricks", "Microsoft Fabric"],
          tools: ["Power BI", "Power Query"],
        },
        detectedRoles: ["Analytics Developer", "Reporting Analyst"],
        recommendedRoles: ["BI Developer", "Data Analyst"],
        source: "heuristic",
        education: [{ credential: "Bachelor of Commerce in Information Systems", institution: "Lakeview University", year: "2018" }],
        certifications: ["Microsoft Certified: Power BI Data Analyst Associate"],
      },
      preferences: {
        locations: ["Greater Toronto Area, ON", "Remote - Canada"],
        minSalary: null,
        roles: ["BI Developer", "Data Engineer", "Analytics Engineer"],
        primaryRoles: ["BI Developer", "Data Engineer"],
        secondaryRoles: ["Analytics Engineer", "Data Analyst"],
      },
    },
  },
  {
    id: "developer",
    label: ".NET developer (invented)",
    education: [{ credential: "Diploma in Computer Programming", institution: "Riverside College", year: "2017" }],
    input: {
      resumeText: devResume,
      profile: {
        summary: "Software developer with 8 years in C# and .NET business applications.",
        yearsOfExperience: 8,
        seniority: "Senior",
        skills: {
          languages: ["C#", "SQL", "T-SQL", "TypeScript", "Python"],
          frameworks: [".NET", "REST APIs", "React"],
          cloudData: ["SQL Server", "Azure"],
          tools: ["Azure DevOps", "CI/CD", "Git", "Power Apps", "Power Automate", "Kubernetes", "Terraform", "Docker"],
        },
        detectedRoles: ["Senior Software Developer", "Software Developer"],
        recommendedRoles: ["Senior .NET Developer", "Azure Developer"],
        source: "heuristic",
        education: [{ credential: "Diploma in Computer Programming", institution: "Riverside College", year: "2017" }],
        certifications: [],
      },
      preferences: {
        locations: ["Greater Toronto Area, ON", "Remote - Canada"],
        minSalary: null,
        roles: ["Senior .NET Developer", "Azure Developer", "Power Platform Developer"],
        primaryRoles: ["Senior .NET Developer", "Azure Developer"],
        secondaryRoles: ["Power Platform Developer", "Software Engineer"],
      },
    },
  },
];
