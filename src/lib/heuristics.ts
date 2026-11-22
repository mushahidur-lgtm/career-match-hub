import type { CandidateProfile, Job, MatchResult, Seniority, SkillSet } from "@/types/job";
import { canonicalSkill, dedupe, extractSkills, flattenSkills, skillPattern } from "@/lib/skills";

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

/* ---------- Keyword match scoring ---------- */

const LEVEL: Record<Seniority, number> = {
  Entry: 0, Junior: 1, "Mid-level": 2, Senior: 3, Lead: 4, Principal: 5, Manager: 4, Executive: 6,
};

function titleLevel(title: string): number | null {
  if (/\b(intern|co-?op|entry)\b/i.test(title)) return 0;
  if (/\b(junior|jr)\b/i.test(title)) return 1;
  if (/\b(intermediate|mid)\b/i.test(title)) return 2;
  if (/\b(senior|sr)\b/i.test(title)) return 3;
  if (/\b(lead|manager)\b/i.test(title)) return 4;
  if (/\b(principal|staff|architect|director)\b/i.test(title)) return 5;
  return null;
}

const STOP = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "intermediate", "the", "of", "and", "ii", "iii"]);
const SYN: Record<string, string> = { engineer: "developer", programmer: "developer", bi: "intelligence" };
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/full[\s-]stack/g, "fullstack")
      .split(/[^a-z0-9.+#]+/)
      .filter((t) => t && !STOP.has(t))
      .map((t) => SYN[t] ?? t),
  );

function titleSimilarity(title: string, roles: string[]): number {
  const a = tokens(title);
  let best = 0;
  for (const role of roles) {
    const b = tokens(role);
    if (!b.size) continue;
    best = Math.max(best, [...b].filter((t) => a.has(t)).length / b.size);
  }
  return best;
}

export function profileSkills(skills: SkillSet): string[] {
  return dedupe(flattenSkills(skills).map(canonicalSkill));
}

export function heuristicMatch(job: Pick<Job, "title" | "description">, profile: CandidateProfile): MatchResult {
  const text = `${job.title}\n${job.description}`;
  const mine = profileSkills(profile.skills);
  const mineLower = new Set(mine.map((s) => s.toLowerCase()));
  const wanted = flattenSkills(extractSkills(text));
  const matching = dedupe([
    ...wanted.filter((s) => mineLower.has(s.toLowerCase())),
    ...mine.filter((s) => skillPattern(s).test(text)),
  ]);
  const matchLower = new Set(matching.map((s) => s.toLowerCase()));
  const missing = wanted.filter((s) => !mineLower.has(s.toLowerCase()) && !matchLower.has(s.toLowerCase()));
  const total = matching.length + missing.length;

  // Short postings name few skills, so pull the ratio toward a neutral prior.
  const skillFit = (matching.length + 1) / (total + 2);
  const titleFit = titleSimilarity(job.title, [...profile.recommendedRoles, ...profile.detectedRoles]);
  const level = titleLevel(job.title);
  const gap = level === null ? 0.5 : Math.abs(level - LEVEL[profile.seniority]);
  const seniorityFit = Math.max(0, 1 - gap * 0.3);

  const score = Math.round(100 * Math.min(1, 0.62 * skillFit + 0.23 * titleFit + 0.15 * seniorityFit + (skillFit > 0.7 ? 0.04 : 0)));

  const reason: string[] = [
    total
      ? `You have ${matching.length} of the ${total} skills this posting names.`
      : "This posting names no recognisable skills, so the score leans on title and level.",
    titleFit >= 0.99 ? "The title matches one of your roles." : titleFit > 0.4 ? "The title is close to your roles." : "The title differs from your roles.",
  ];
  if (level !== null && gap >= 2) reason.push(level > LEVEL[profile.seniority] ? "It asks for a more senior level." : "It sits below your current level.");

  return { score, matchingSkills: matching.slice(0, 14), missingSkills: missing.slice(0, 10), matchReason: reason.join(" "), source: "heuristic" };
}
