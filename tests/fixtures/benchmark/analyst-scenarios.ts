/** Invented postings for the analyst candidate. Labels were written before the engine was run on them. */
import type { Scenario } from "@/lib/benchmark/types";

const about = "\n\nAbout us: we are a growing organisation with flexible hours, a learning budget and a collaborative team that values clear documentation and steady delivery over heroics.";
const make = (s: Omit<Scenario, "candidate">): Scenario => ({ candidate: "analyst", ...s, description: s.description + about });

export const ANALYST_SCENARIOS: Scenario[] = [
  make({
    id: "an-01", category: "BI Developer", kind: "direct", title: "BI Developer",
    description: `Responsibilities:
- Build Power BI dashboards and semantic models for operations and finance.
- Write T-SQL and maintain the reporting warehouse on SQL Server.
- Gather requirements from stakeholders.
Requirements:
- 5+ years of experience in business intelligence.
- Power BI and DAX.
- Strong SQL.
- Data modeling.
Nice to have:
- SSIS`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["Power BI", "DAX", "SQL", "Data modeling"], evidence: { "Power BI": "professional", DAX: "professional", SQL: "professional" } },
  }),
  make({
    id: "an-02", category: "Data Engineer", kind: "strong_some_missing", title: "Data Engineer",
    description: `Responsibilities:
- Build data pipelines and transformations that load our warehouse.
- Model data for reporting.
Requirements:
- 4+ years of experience with data integration.
- Azure Synapse.
- SQL.
- ETL.
- Kafka.
Nice to have:
- Airflow`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["Azure Synapse", "SQL", "ETL", "Kafka"], notMatched: ["Kafka"], evidence: { "Azure Synapse": "professional" } },
  }),
  make({
    id: "an-03", category: "Data Engineer", kind: "learning_only", title: "Data Engineer",
    description: `Responsibilities:
- Develop Spark jobs in Databricks and orchestrate data pipelines.
Requirements:
- Databricks.
- PySpark.
- Python.
- Apache Spark.
- Airflow.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Databricks", "PySpark", "Python", "Apache Spark", "Airflow"], evidence: { Databricks: "learning", PySpark: "learning", Python: "project" } },
  }),
  make({
    id: "an-04", category: "Data Engineer", kind: "adjacent_professional", title: "Azure Data Engineer",
    description: `Responsibilities:
- Build ingestion and data pipelines into the lakehouse.
- Maintain Azure SQL databases.
Requirements:
- Azure Data Factory.
- Azure SQL.
- SQL.
- ETL.
Nice to have:
- Microsoft Fabric`,
    expect: { tier: "consider", eligibility: "not_applicable", required: ["Azure Data Factory", "Azure SQL", "SQL", "ETL"], notMatched: ["Azure Data Factory", "Azure SQL"] },
  }),
  make({
    id: "an-05", category: "BI Developer", kind: "transferable", title: "Business Intelligence Developer",
    description: `Responsibilities:
- Create dashboards and reports for sales leaders.
Requirements:
- Tableau.
- SQL.
- Data modeling.
Nice to have:
- Looker`,
    expect: { tier: "consider", eligibility: "not_applicable", required: ["Tableau", "SQL", "Data modeling"], notMatched: ["Tableau"] },
  }),
  make({
    id: "an-06", category: "AI/ML Engineer", kind: "keyword_overlap", title: "Machine Learning Engineer",
    description: `Responsibilities:
- Train, deploy and monitor machine learning and large language model services in production.
- Own MLOps tooling and model evaluation.
Requirements:
- Python and SQL.
- PyTorch.
- MLOps.
- Docker.
- Kubernetes.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Python", "SQL", "PyTorch", "MLOps", "Docker", "Kubernetes"], notMatched: ["PyTorch", "MLOps"] },
  }),
  make({
    id: "an-07", category: "Software Engineer", kind: "wrong_specialization", title: "Frontend Software Engineer",
    description: `Responsibilities:
- Build user interfaces in React and maintain a component library.
Requirements:
- React.
- TypeScript.
- CSS.
Nice to have:
- SQL`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["React", "TypeScript", "CSS"], notMatched: ["React", "TypeScript", "CSS"] },
  }),
  make({
    id: "an-08", category: "BI Developer", kind: "seniority_mismatch", title: "Director of Business Intelligence",
    description: `Responsibilities:
- Lead a department of managers and set the analytics strategy and budget.
Requirements:
- 12+ years of experience.
- Power BI.
- SQL.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Power BI", "SQL"] },
  }),
  make({
    id: "an-09", category: "BI Developer", kind: "seniority_mismatch", title: "Junior Data Analyst",
    description: `Responsibilities:
- Prepare reports under supervision.
Requirements:
- 0-1 years of experience.
- Excel and SQL.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Excel", "SQL"] },
  }),
  make({
    id: "an-10", category: "Data Engineer", kind: "location_mismatch", title: "Data Engineer", location: "Calgary, AB", workMode: "On-site",
    description: `Responsibilities:
- Build data pipelines for the warehouse. On-site five days a week.
Requirements:
- Azure Synapse.
- SQL.
- ETL.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Azure Synapse", "SQL", "ETL"] },
  }),
  make({
    id: "an-11", category: "BI Developer", kind: "work_authorization", title: "BI Developer", facts: { workAuthorization: "work_permit" },
    description: `Responsibilities:
- Build Power BI dashboards for a federal department.
Requirements:
- Power BI.
- SQL.
- DAX.
- Applicants must be Canadian citizens.`,
    expect: { tier: "no", eligibility: "not_eligible", required: ["Power BI", "SQL", "DAX"] },
  }),
  make({
    id: "an-12", category: "BI Developer", kind: "missing_mandatory", title: "Senior BI Developer",
    description: `Responsibilities:
- Build semantic models and reports.
Requirements:
- Power BI and DAX.
- SQL.
- A Master's degree in Statistics is required.`,
    expect: { tier: "consider", eligibility: "needs_verification", required: ["Power BI", "DAX", "SQL"], missingQualifications: ["Master's degree"] },
  }),
  make({
    id: "an-13", category: "Data Engineer", kind: "missing_certification", title: "Data Engineer",
    description: `Responsibilities:
- Build pipelines and transformations on Azure.
Requirements:
- Azure Synapse.
- SQL.
- ETL.
- Microsoft Certified: Azure Data Engineer Associate certification is required.`,
    expect: { tier: "consider", eligibility: "needs_verification", required: ["Azure Synapse", "SQL", "ETL"], missingQualifications: ["Azure Data Engineer Associate"] },
  }),
  make({
    id: "an-14", category: "BI Developer", kind: "incomplete", title: "BI Developer", truncated: true,
    description: "We need a BI developer to join our reporting team. Apply for details.",
    expect: { tier: "consider", eligibility: "not_applicable", required: [] },
  }),
  make({
    id: "an-15", category: "BI Developer", kind: "expired", title: "Power BI Developer",
    description: `This position has been filled and we are no longer accepting applications.
Requirements:
- Power BI.
- DAX.
- SQL.`,
    expect: { tier: "no", eligibility: "not_applicable", required: ["Power BI", "DAX", "SQL"] },
  }),
  make({
    id: "an-16", category: "Data Engineer", kind: "ambiguous", title: "Data Specialist",
    description: "You will help with data. Our stack has included SQL, Python, Snowflake, dbt and Airflow at various times, and curiosity matters more than any one of them.",
    expect: { tier: "consider", eligibility: "not_applicable", required: [] },
  }),
  make({
    id: "an-17", category: "Data Engineer", kind: "career_transition", title: "Analytics Engineer",
    description: `Responsibilities:
- Model warehouse data and write tested transformations for analysts.
Requirements:
- SQL.
- Data modeling.
- dbt.
Nice to have:
- Snowflake
- Python`,
    expect: { tier: "consider", eligibility: "not_applicable", required: ["SQL", "Data modeling", "dbt"], notMatched: ["dbt"] },
  }),
  make({
    id: "an-18", category: "BI Developer", kind: "direct", title: "Data Analyst",
    description: `Responsibilities:
- Analyse operations data, build reports and present insights to stakeholders.
Requirements:
- 3+ years of experience.
- SQL.
- Power BI.
Nice to have:
- Python`,
    expect: { tier: "apply", eligibility: "not_applicable", required: ["SQL", "Power BI"], evidence: { Python: "project" } },
  }),
];
