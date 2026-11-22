import type { CandidateProfile, Seniority, SkillSet } from "@/types/job";
import { canonicalSkill, dedupe, extractSkills, flattenSkills } from "@/lib/skills";

/* ---------- Resume analysis without an API key ---------- */

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const MONTH_RE = "(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?,?\\s+)?";

function removeEducation(text: string): string {
  return text.replace(
    /^\s*(?:education|academic background)\b[^\n]*\n[\s\S]*?(?=^\s*(?:(?:work|professional)\s+)?(?:experience|employment|projects|skills|technical skills|certifications|summary)\b|(?![\s\S]))/gim,
    "\n",
  );
}

export function estimateYears(text: string, now = new Date()): number | null {
  const stated = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b(?:\s+of)?(?:\s+[\w-]+){0,4}\s+experience/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n < 50);
  if (stated.length) return Math.max(...stated);

  const range = new RegExp(
    `${MONTH_RE}((?:19|20)\\d{2})\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:${MONTH_RE}((?:19|20)\\d{2})|(present|current|now|today))`,
    "gi",
  );
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const m of removeEducation(text).matchAll(range)) {
    const start = Number(m[2]) * 12 + (m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : 0);
    const end = m[5] ? nowMonths : Number(m[4]) * 12 + (m[3] ? MONTHS.indexOf(m[3].toLowerCase()) : 0);
    if (end > start && end - start < 50 * 12) spans.push([start, Math.min(end, nowMonths)]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cursor = -Infinity;
  for (const [s, e] of spans) {
    total += Math.max(0, e - Math.max(s, cursor));
    cursor = Math.max(cursor, e);
  }
  return Math.max(1, Math.round(total / 12));
}

interface RoleTemplate {
  title: string;
  alias: RegExp;
  skills: string[];
}

const ROLES: RoleTemplate[] = [
  { title: "Data Engineer", alias: /data engineer/i, skills: ["Python", "SQL", "Apache Spark", "Airflow", "dbt", "Snowflake", "Databricks", "Azure Data Factory", "ETL", "Kafka"] },
  { title: "BI Developer", alias: /(?:bi|business intelligence) developer/i, skills: ["Power BI", "DAX", "SQL", "SSRS", "SSIS", "Tableau", "Power Query", "Data modeling", "SQL Server"] },
  { title: "Analytics Engineer", alias: /analytics engineer/i, skills: ["dbt", "SQL", "Snowflake", "BigQuery", "Data modeling", "Looker", "Git", "Python"] },
  { title: "Data Analyst", alias: /data analyst/i, skills: ["SQL", "Excel", "Power BI", "Tableau", "Python", "R", "Pandas"] },
  { title: "Financial Analyst", alias: /financial analyst|fp&a/i, skills: ["Excel", "Power BI", "SAP", "Anaplan", "NetSuite", "VBA", "SQL"] },
  { title: "Data Scientist", alias: /data scientist/i, skills: ["Python", "R", "Machine learning", "scikit-learn", "Pandas", "TensorFlow", "PyTorch", "SQL"] },
  { title: "Machine Learning Engineer", alias: /(?:machine learning|ml) engineer/i, skills: ["Python", "PyTorch", "TensorFlow", "MLOps", "MLflow", "Docker", "Kubernetes", "LLMs"] },
  { title: "Software Developer", alias: /software (?:developer|engineer)/i, skills: ["Java", "C#", "Python", "TypeScript", "SQL", "Git", "REST APIs", "Docker", "CI/CD"] },
  { title: "Full Stack Developer", alias: /full[\s-]?stack/i, skills: ["React", "Node.js", "TypeScript", "JavaScript", "PostgreSQL", "REST APIs", "Next.js", "MongoDB"] },
  { title: "Frontend Developer", alias: /front[\s-]?end/i, skills: ["React", "TypeScript", "JavaScript", "CSS", "HTML", "Next.js", "Vue.js", "Angular"] },
  { title: "Backend Developer", alias: /back[\s-]?end/i, skills: ["Java", "Spring Boot", "Node.js", "Go", "PostgreSQL", "Microservices", "Kafka", "Redis", "Docker"] },
  { title: ".NET Developer", alias: /\.net developer/i, skills: ["C#", ".NET", "SQL Server", "Entity Framework", "Azure", "Blazor", "REST APIs"] },
  { title: "Java Developer", alias: /java developer/i, skills: ["Java", "Spring Boot", "Hibernate", "Microservices", "Oracle", "SQL", "Kafka"] },
  { title: "Python Developer", alias: /python developer/i, skills: ["Python", "Django", "Flask", "FastAPI", "PostgreSQL", "Docker", "REST APIs"] },
  { title: "DevOps Engineer", alias: /devops|site reliability/i, skills: ["AWS", "Azure", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD", "Linux", "Ansible", "GitHub Actions"] },
  { title: "Cloud Engineer", alias: /cloud (?:engineer|architect)/i, skills: ["AWS", "Azure", "GCP", "Terraform", "Kubernetes", "Linux", "Python", "PowerShell"] },
  { title: "Database Administrator", alias: /database administrator|\bdba\b/i, skills: ["SQL Server", "Oracle", "PostgreSQL", "MySQL", "T-SQL", "PL/SQL", "PowerShell"] },
  { title: "QA Automation Engineer", alias: /\bqa\b|test automation/i, skills: ["Selenium", "Cypress", "Playwright", "Postman", "CI/CD", "Java", "Python", "Jira"] },
  { title: "Business Analyst", alias: /business analyst/i, skills: ["SQL", "Excel", "Jira", "Confluence", "Agile", "Power BI", "Scrum"] },
  { title: "Project Manager", alias: /project manager|scrum master/i, skills: ["Agile", "Scrum", "Jira", "Confluence", "Excel", "SharePoint"] },
  { title: "Salesforce Developer", alias: /salesforce/i, skills: ["Salesforce", "JavaScript", "REST APIs", "SQL", "Git"] },
  { title: "Mobile Developer", alias: /mobile|ios developer|android/i, skills: ["Kotlin", "Swift", "React Native", "Flutter", "Dart", "REST APIs"] },
];

function detectSeniority(text: string, years: number | null): Seniority {
  const head = text.slice(0, 1500);
  if (/\b(?:chief \w+ officer|cto|cio|cfo|vice president|vp)\b/i.test(head)) return "Executive";
  if (/\bprincipal (?:\w+ )?(?:engineer|developer|architect|analyst|consultant)\b/i.test(head)) return "Principal";
  if (/\b(?:engineering|data|development|analytics|finance|it) (?:manager|director)\b|\bdirector of\b/i.test(head)) return "Manager";
  if (/\b(?:tech(?:nical)?|team) lead\b|\blead (?:\w+ )?(?:engineer|developer|analyst)\b/i.test(head)) return "Lead";
  if (/\b(?:senior|sr\.?)\s/i.test(head)) return "Senior";
  if (years === null) return /\b(?:intern|co-?op|new grad|junior)\b/i.test(head) ? "Junior" : "Mid-level";
  if (years < 1) return "Entry";
  if (years < 3) return "Junior";
  if (years < 6) return "Mid-level";
  return years < 12 ? "Senior" : "Lead";
}

export function heuristicProfile(text: string): CandidateProfile {
  const skills = extractSkills(text);
  const all = flattenSkills(skills);
  const have = new Set(all.map((s) => s.toLowerCase()));
  const years = estimateYears(text);
  const seniority = detectSeniority(text, years);

  const ranked = ROLES.map((r) => {
    const hits = r.skills.filter((s) => have.has(s.toLowerCase())).length;
    const mentioned = r.alias.test(text);
    return { r, hits, mentioned, score: hits / r.skills.length + (mentioned ? 0.6 : 0) };
  })
    .filter((x) => x.mentioned || x.hits >= 2)
    .sort((a, b) => b.score - a.score);

  const detected = ranked.filter((x) => x.mentioned).map((x) => x.r.title).slice(0, 4);
  const top = ranked.slice(0, 7).map((x) => x.r.title);
  for (const filler of ["Business Analyst", "Data Analyst", "Software Developer", "Project Manager", "QA Automation Engineer"]) {
    if (top.length >= 5) break;
    if (!top.includes(filler)) top.push(filler);
  }
  const prefix =
    seniority === "Senior" || seniority === "Lead" ? "Senior " : seniority === "Junior" || seniority === "Entry" ? "Junior " : "";
  const recommended = dedupe(top.map((t, i) => (prefix && i < 2 ? prefix + t : t))).slice(0, 8);

  const exp = years ? `about ${years} year${years === 1 ? "" : "s"} of experience` : "an experience level we could not date";
  const lead = detected[0] ?? top[0];
  const summary = `${seniority} ${lead} profile with ${exp}. ${
    all.length
      ? `Strongest signals: ${all.slice(0, 6).join(", ")}.`
      : "No technical skills were recognised, so add yours below before searching."
  }`;

  return { summary, yearsOfExperience: years, seniority, skills, detectedRoles: detected, recommendedRoles: recommended, source: "heuristic" };
}

/* ---------- Skills helper ---------- */

/** The skills on the profile as one deduplicated list of canonical names. */
export function profileSkills(skills: SkillSet): string[] {
  return dedupe(flattenSkills(skills).map(canonicalSkill));
}
