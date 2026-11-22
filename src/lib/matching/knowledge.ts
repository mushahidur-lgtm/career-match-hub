/**
 * Plain data the matching engine reads. Kept separate so it is easy to review and extend.
 */

export interface Concept {
  id: string;
  label: string;
  pattern: RegExp;
}

/** What the work actually consists of, independent of tool names. */
export const CONCEPTS: Concept[] = [
  { id: "pipelines", label: "data pipelines and integration", pattern: /\b(?:etl|elt|data pipelines?|pipelines?|data ingestion|ingest(?:ion)?|data integration|orchestrat\w+|data factory)\b/gi },
  { id: "warehouse", label: "data modeling and warehousing", pattern: /\b(?:data warehous\w+|data model(?:l)?ing|dimensional|star schema|lakehouse|data lake|medallion|delta lake)\b/gi },
  { id: "bi", label: "reporting and dashboards", pattern: /\b(?:dashboards?|reporting|reports|business intelligence|kpis?|visuali[sz]ations?|semantic models?|power bi|tableau)\b/gi },
  { id: "analytics", label: "analysis and insights", pattern: /\b(?:analy(?:sis|tics|ze[sd]?|se[sd]?)|insights?|forecast\w*|statistic\w*|ad[- ]hoc)\b/gi },
  { id: "cloud", label: "cloud platforms and infrastructure", pattern: /\b(?:cloud|azure|aws|gcp|infrastructure|terraform|kubernetes|containers?|serverless)\b/gi },
    { id: "backend", label: "application and API development", pattern: /\b(?:apis?|rest\w*|microservices?|back-?end|web services?|application development|software development)\b|(?<![A-Za-z0-9])(?:\.net|c#)(?![A-Za-z0-9+#])/gi },
  { id: "frontend", label: "front-end development", pattern: /\b(?:front-?end|react|angular|user interfaces?)\b/gi },
  { id: "devops", label: "CI/CD and automation", pattern: /\b(?:ci\/cd|devops|deployments?|release management|build automation|github actions)\b/gi },
  { id: "ml", label: "machine learning and generative AI", pattern: /\b(?:machine learning|genai|generative ai|llms?|nlp|prompt engineering|openai|copilot)\b/gi },
  { id: "integration", label: "systems integration", pattern: /\b(?:integrations?|middleware|service bus|logic apps|api management|mulesoft|edi)\b/gi },
  { id: "powerplatform", label: "Power Platform and Dynamics", pattern: /\b(?:power platform|power apps|power automate|dynamics 365|dataverse|d365)\b/gi },
  { id: "governance", label: "governance, quality and security", pattern: /\b(?:security|governance|compliance|data quality|privacy|access control|rbac|gdpr|pipeda)\b/gi },
  { id: "delivery", label: "stakeholder and team delivery", pattern: /\b(?:stakeholders?|requirements gathering|agile|scrum|mentor\w*|cross-functional)\b/gi },
  { id: "database", label: "database development and tuning", pattern: /\b(?:performance tuning|query optimi[sz]ation|stored procedures?|indexing|database design|t-sql|pl\/sql)\b/gi },
];

export interface Industry {
  id: string;
  label: string;
  pattern: RegExp;
}

export const INDUSTRIES: Industry[] = [
  { id: "finance", label: "banking and finance", pattern: /\b(?:bank(?:ing)?|financial services|fintech|wealth management|capital markets|investment|credit union)\b/i },
  { id: "insurance", label: "insurance", pattern: /\binsurance\b/i },
  { id: "health", label: "healthcare", pattern: /\b(?:health ?care|hospital|clinical|pharma\w*|life sciences|medical)\b/i },
  { id: "government", label: "government and public sector", pattern: /\b(?:government|public sector|federal|provincial|municipal|crown corporation|defen[cs]e)\b/i },
  { id: "retail", label: "retail and e-commerce", pattern: /\b(?:retail|e-?commerce|consumer goods|cpg)\b/i },
  { id: "energy", label: "energy and utilities", pattern: /\b(?:energy|utilit(?:y|ies)|oil and gas|hydro|power generation)\b/i },
  { id: "telecom", label: "telecommunications", pattern: /\b(?:telecom\w*|wireless carrier)\b/i },
  { id: "education", label: "education", pattern: /\b(?:universit(?:y|ies)|college|education|edtech)\b/i },
  { id: "logistics", label: "logistics and transportation", pattern: /\b(?:logistics|supply chain|transportation|shipping|freight|airline)\b/i },
  { id: "manufacturing", label: "manufacturing", pattern: /\b(?:manufacturing|industrial|automotive)\b/i },
  { id: "consulting", label: "consulting", pattern: /\b(?:consulting|consultancy|professional services|systems integrator)\b/i },
];

export interface SkillFamily {
  id: string;
  skills: string[];
  /** Share of full credit a related-but-different skill earns. */
  credit: number;
}

/** Tools that do the same job. Having one is real, partial evidence for another. Names match skills.ts. */
export const SKILL_FAMILIES: SkillFamily[] = [
  { id: "cloud platform", credit: 0.6, skills: ["AWS", "Azure", "GCP"] },
  { id: "relational database", credit: 0.6, skills: ["SQL Server", "PostgreSQL", "MySQL", "Oracle", "T-SQL", "PL/SQL"] },
  { id: "BI tool", credit: 0.7, skills: ["Power BI", "Tableau", "Looker", "Qlik"] },
  { id: "distributed compute", credit: 0.6, skills: ["Apache Spark", "Databricks", "PySpark", "Hadoop"] },
  { id: "orchestration and ETL", credit: 0.5, skills: ["Airflow", "Azure Data Factory", "SSIS", "Informatica", "Talend", "Fivetran", "AWS Glue"] },
  { id: "data warehouse", credit: 0.6, skills: ["Snowflake", "BigQuery", "Redshift", "Azure Synapse", "Microsoft Fabric"] },
  { id: "front-end framework", credit: 0.5, skills: ["React", "Angular", "Vue.js", "Svelte"] },
  { id: "JVM language", credit: 0.5, skills: ["Java", "Kotlin", "Scala"] },
  { id: "JavaScript family", credit: 0.8, skills: ["JavaScript", "TypeScript"] },
  { id: "containers", credit: 0.5, skills: ["Docker", "Kubernetes", "Helm"] },
  { id: "infrastructure as code", credit: 0.5, skills: ["Terraform", "Ansible"] },
  { id: "CI/CD tool", credit: 0.6, skills: ["Jenkins", "GitHub Actions", "GitLab CI", "Azure DevOps"] },
  { id: "test automation", credit: 0.6, skills: ["Selenium", "Cypress", "Playwright"] },
  { id: "NoSQL store", credit: 0.5, skills: ["MongoDB", "Cassandra", "DynamoDB", "Cosmos DB", "Redis", "Elasticsearch"] },
  { id: "ML framework", credit: 0.6, skills: ["TensorFlow", "PyTorch", "scikit-learn", "Keras"] },
];

/** Place names that count as the same area for commuting. Matched as whole words. */
export const REGIONS: { id: string; triggers: RegExp; places: string[] }[] = [
  {
    id: "Greater Toronto Area",
    triggers: /\b(?:toronto|gta|greater toronto)\b/i,
    places: ["toronto", "mississauga", "brampton", "markham", "vaughan", "richmond hill", "oakville", "burlington", "etobicoke", "scarborough", "north york", "pickering", "ajax", "whitby", "oshawa", "milton", "thornhill", "concord", "greater toronto"],
  },
  {
    id: "Ottawa",
    triggers: /\bottawa\b/i,
    places: ["ottawa", "kanata", "nepean", "orleans", "orléans", "barrhaven", "gloucester", "stittsville", "manotick"],
  },
  {
    id: "Gatineau",
    triggers: /\bgatineau\b/i,
    places: ["gatineau", "aylmer", "hull", "chelsea"],
  },
];

export const CANADA_HINTS = /\b(?:canada|canadian|ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)\b/;
export const FOREIGN_HINTS = /\b(?:united states|usa|u\.s\.|us only|u\.s\. only|united kingdom|uk|europe|india|australia)\b/i;
