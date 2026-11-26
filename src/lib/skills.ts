import type { SkillCategory, SkillSet } from "@/types/job";

interface SkillDef {
  name: string;
  category: SkillCategory;
  pattern: RegExp;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches whole tokens only, so "Java" never matches "JavaScript" and "C" never matches "C++". */
export function termPattern(terms: string[], flags = "i"): RegExp {
  // Longest first, so "ASP.NET Core" is read whole rather than as "ASP.NET" followed by a stray word.
  const body = [...terms].sort((a, b) => b.length - a.length).map((t) => escape(t).replace(/ /g, "[\\s-]+")).join("|");
  return new RegExp(`(?<![A-Za-z0-9+#&])(?:${body})(?![A-Za-z0-9+#&])`, flags);
}

const skills: SkillDef[] = [];

function add(category: SkillCategory, entries: (string | string[])[]) {
  for (const entry of entries) {
    const terms = Array.isArray(entry) ? entry : [entry];
    skills.push({ name: terms[0], category, pattern: termPattern(terms) });
  }
}

/** For names that are also ordinary words, where case or list context matters. */
function addExact(category: SkillCategory, name: string, pattern: RegExp) {
  skills.push({ name, category, pattern });
}

/** A single letter or common word counts only when it sits in a list of skills. */
const listContext = (word: string) =>
  new RegExp(
    `(?<![A-Za-z0-9+#&.-])${word}(?=\\s*[,;/|)\\u2022]|\\s+(?:and|or|developer|programming|engineer)\\b|\\s*$)(?![&-])`,
    "m",
  );

add("languages", [
  "Python", "Java", ["JavaScript", "ECMAScript"], "TypeScript", ["C#", "C Sharp"], "C++", "Golang",
  "Kotlin", "Scala", "Ruby", "PHP", "Perl", "SQL", ["T-SQL", "TSQL", "Transact-SQL"], ["PL/SQL", "PLSQL"],
  "MATLAB", "VBA", "DAX", "Bash", "PowerShell", "HTML", "CSS", "Objective-C", "Dart", "COBOL",
]);
addExact("languages", "Go", new RegExp(`${termPattern(["Golang"]).source}|${listContext("Go").source}`, "m"));
addExact("languages", "R", listContext("R"));
addExact("languages", "C", listContext("C"));
addExact("languages", "Rust", /(?<![A-Za-z])Rust(?![A-Za-z])/);
addExact("languages", "Swift", /(?<![A-Za-z])Swift(?![A-Za-z])/);

add("frameworks", [
  ["React", "React.js", "ReactJS"], ["Next.js", "NextJS"], ["Angular", "AngularJS"], ["Vue.js", "Vue", "VueJS"], "Svelte",
  ["Node.js", "NodeJS"], ["Express.js", "ExpressJS"], "NestJS", "Django", "Flask", "FastAPI",
  [".NET", ".NET Core", "ASP.NET", "ASP.NET Core"], ["Entity Framework", "EF Core"], "Blazor", "Spring Boot", "Hibernate",
  ["Ruby on Rails", "Rails"], "Laravel", "React Native", "Flutter", ["Tailwind CSS", "Tailwind"], "Bootstrap", "GraphQL",
  ["REST APIs", "REST API", "RESTful", "RESTful APIs", "RESTful API"], "gRPC", "Pandas", "NumPy", ["scikit-learn", "sklearn"],
  "TensorFlow", "PyTorch", "Keras", "PySpark", "LangChain", "Microservices", "jQuery", "Redux",
]);

add("cloudData", [
  ["AWS", "Amazon Web Services"], ["Azure", "Microsoft Azure"], ["GCP", "Google Cloud", "Google Cloud Platform"],
  "Azure Data Factory", ["Azure SQL", "Azure SQL Database"], ["Azure Synapse", "Synapse"], "Azure DevOps", ["Microsoft Fabric", "MS Fabric"], "Snowflake", "Databricks",
  ["BigQuery", "Big Query"], ["Redshift", "Amazon Redshift"], ["Apache Spark", "Spark"], ["Kafka", "Apache Kafka"],
  ["Airflow", "Apache Airflow"], "dbt", "Hadoop", "Hive", ["PostgreSQL", "Postgres"], "MySQL", ["SQL Server", "MS SQL", "MSSQL"],
  "MongoDB", "Redis", "Cassandra", "DynamoDB", ["Elasticsearch", "Elastic Search"], ["Cosmos DB", "CosmosDB"], "Delta Lake",
  "ETL", "ELT", ["Data modeling", "Data modelling", "dimensional modeling", "dimensional modelling"],
  ["Data warehousing", "Data warehouse"], "SSIS", "SSRS", "SSAS", "Informatica", "Talend", "Fivetran", "AWS Lambda", "AWS Glue",
  "Machine learning", ["LLMs", "LLM", "large language models"], "MLOps", "MLflow", "SageMaker",
]);
addExact("cloudData", "Oracle", /(?<![A-Za-z])Oracle(?![A-Za-z])/);

add("tools", [
  "Docker", ["Kubernetes", "K8s"], "Terraform", "Ansible", "Jenkins", "Git", "GitHub Actions", ["GitLab CI", "GitLab"],
  ["CI/CD", "CICD", "continuous integration"], "Linux", "Jira", "Confluence", ["Power BI", "PowerBI"], "Tableau", "Looker",
  ["Qlik", "QlikView", "Qlik Sense"], "Power Query", "Power Automate", "Power Apps", "SharePoint", "Salesforce", "ServiceNow",
  "NetSuite", "QuickBooks", "Anaplan", "Alteryx", "Selenium", "Cypress", "Playwright", "Postman", "Jest", "Figma", "Grafana",
  "Prometheus", "Datadog", "Splunk", "Agile", "Scrum", ["VS Code", "Visual Studio Code"], "Google Analytics", "Helm",
]);
addExact("tools", "Excel", /(?<![A-Za-z])(?:Microsoft |MS )?Excel(?![A-Za-z])/);
addExact("tools", "SAP", /(?<![A-Za-z])SAP(?![A-Za-z])/);

const canonicalByLower = new Map(skills.map((s) => [s.name.toLowerCase(), s]));

export function emptySkillSet(): SkillSet {
  return { languages: [], frameworks: [], cloudData: [], tools: [] };
}

export function extractSkills(text: string): SkillSet {
  const out = emptySkillSet();
  for (const s of skills) if (s.pattern.test(text)) out[s.category].push(s.name);
  return out;
}

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((raw) => {
    const k = raw.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function flattenSkills(set: SkillSet): string[] {
  return dedupe([...set.languages, ...set.frameworks, ...set.cloudData, ...set.tools]);
}

/** Maps spelling variants ("Postgres", "NodeJS") onto one name so comparisons are fair. */
export function canonicalSkill(name: string): string {
  const trimmed = name.trim();
  const exact = canonicalByLower.get(trimmed.toLowerCase());
  if (exact) return exact.name;
  for (const s of skills) {
    const m = s.pattern.exec(trimmed);
    if (m && m[0].length === trimmed.length) return s.name;
  }
  return trimmed;
}

/** Pattern that finds a skill, in any known spelling, inside free text. */
export function skillPattern(name: string): RegExp {
  return canonicalByLower.get(canonicalSkill(name).toLowerCase())?.pattern ?? termPattern([name.trim()]);
}
