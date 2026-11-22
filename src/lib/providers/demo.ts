import type { EmploymentType, Job, JobCategory, SearchFilters, WorkMode } from "@/types/job";
import { cityOf, countriesFor, isRemoteLocation } from "./common";

interface Template {
  title: string;
  category: JobCategory;
  skills: string[];
  /** Yearly CAD range at mid-level. */
  pay: [number, number];
  blurb: string;
}

const TEMPLATES: Template[] = [
  { title: "Data Engineer", category: "Data and analytics", skills: ["Python", "SQL", "Apache Spark", "Airflow", "Azure Data Factory", "Snowflake", "ETL"], pay: [100_000, 140_000], blurb: "Build and run the pipelines that move data from source systems into a governed warehouse." },
  { title: "BI Developer", category: "Data and analytics", skills: ["Power BI", "DAX", "SQL", "SSIS", "SSRS", "Data modeling", "SQL Server"], pay: [90_000, 125_000], blurb: "Design semantic models and dashboards that finance and operations teams use every day." },
  { title: "Analytics Engineer", category: "Data and analytics", skills: ["dbt", "SQL", "Snowflake", "Looker", "Git", "Data modeling"], pay: [105_000, 145_000], blurb: "Turn raw tables into tested, documented models the whole company can query." },
  { title: "Data Analyst", category: "Data and analytics", skills: ["SQL", "Excel", "Tableau", "Python", "Power BI"], pay: [75_000, 105_000], blurb: "Answer business questions with data and present findings to stakeholders." },
  { title: "Senior Software Developer", category: "Software engineering", skills: ["C#", ".NET", "SQL Server", "Azure", "REST APIs", "Entity Framework", "CI/CD"], pay: [115_000, 155_000], blurb: "Own services end to end, from design review to production support." },
  { title: "Software Developer", category: "Software engineering", skills: ["Java", "Spring Boot", "PostgreSQL", "Docker", "REST APIs", "Git"], pay: [95_000, 130_000], blurb: "Ship features across a Java service platform used by thousands of customers." },
  { title: "Full Stack Developer", category: "Software engineering", skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "REST APIs", "Docker"], pay: [100_000, 140_000], blurb: "Work across the React front end and Node services of a growing product." },
  { title: "Backend Developer", category: "Software engineering", skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "Kafka", "Docker", "AWS"], pay: [105_000, 145_000], blurb: "Design APIs and event-driven services that stay fast under load." },
  { title: "Frontend Developer", category: "Software engineering", skills: ["React", "TypeScript", "Next.js", "CSS", "Jest", "Figma"], pay: [90_000, 125_000], blurb: "Build accessible, fast interfaces in close partnership with design." },
  { title: "DevOps Engineer", category: "Cloud and DevOps", skills: ["AWS", "Terraform", "Kubernetes", "Docker", "GitHub Actions", "Linux", "Python"], pay: [110_000, 150_000], blurb: "Automate infrastructure and make releases boring." },
  { title: "Cloud Engineer", category: "Cloud and DevOps", skills: ["Azure", "Terraform", "PowerShell", "Kubernetes", "Azure DevOps", "Linux"], pay: [105_000, 145_000], blurb: "Run the landing zones and platform services teams build on." },
  { title: "Machine Learning Engineer", category: "AI and machine learning", skills: ["Python", "PyTorch", "MLOps", "Docker", "AWS", "scikit-learn", "SQL"], pay: [120_000, 165_000], blurb: "Take models from notebook to monitored production service." },
  { title: "Data Scientist", category: "AI and machine learning", skills: ["Python", "scikit-learn", "Pandas", "SQL", "Machine learning", "R"], pay: [100_000, 140_000], blurb: "Build forecasting and classification models that drive decisions." },
  { title: "QA Automation Engineer", category: "QA and testing", skills: ["Selenium", "Cypress", "Playwright", "Postman", "Java", "CI/CD", "Jira"], pay: [80_000, 110_000], blurb: "Own the automated test suites that gate every release." },
  { title: "Security Analyst", category: "Cybersecurity", skills: ["Splunk", "Linux", "Python", "AWS", "PowerShell"], pay: [90_000, 125_000], blurb: "Monitor, triage and respond to security events across cloud and endpoints." },
  { title: "Business Analyst", category: "Product and projects", skills: ["SQL", "Jira", "Confluence", "Excel", "Agile", "Power BI"], pay: [80_000, 110_000], blurb: "Translate business needs into clear requirements and measurable outcomes." },
  { title: "Project Manager", category: "Product and projects", skills: ["Agile", "Scrum", "Jira", "Confluence", "SharePoint", "Excel"], pay: [90_000, 125_000], blurb: "Lead cross-functional delivery of technology projects on time and on budget." },
  { title: "Database Administrator", category: "IT and support", skills: ["SQL Server", "T-SQL", "PowerShell", "Oracle", "PostgreSQL"], pay: [95_000, 130_000], blurb: "Keep critical databases fast, backed up and secure." },
  { title: "Financial Analyst", category: "Business and finance", skills: ["Excel", "Power BI", "SQL", "SAP", "Anaplan"], pay: [75_000, 105_000], blurb: "Own monthly forecasting, variance analysis and board reporting." },
];

const COMPANIES = [
  "Northfield Analytics", "Rideau Systems", "Maplewood Digital", "Pinegrove Software", "Lakeshore Data Co.",
  "Capital Cloud Works", "Harbourline Technologies", "Blue Heron Labs", "Cedarview Health IT", "Summit Ridge Financial",
  "Borealis Platforms", "Granite Peak Consulting", "Ironbridge Logistics", "Willowbrook Insurance", "Tidewater Energy Systems",
  "Quarry Lane Software", "Aspen Row Group", "Stonehaven Retail Tech", "Kestrel Public Sector Solutions", "Oakhill Bank Technology",
];

const NEAR: Record<string, string[]> = {
  Ottawa: ["Ottawa, ON", "Kanata, ON", "Nepean, ON", "Gatineau, QC"],
  Gatineau: ["Gatineau, QC", "Ottawa, ON", "Aylmer, QC"],
  Toronto: ["Toronto, ON", "Mississauga, ON", "Markham, ON", "Etobicoke, ON"],
  Montreal: ["Montreal, QC", "Laval, QC", "Longueuil, QC"],
  Vancouver: ["Vancouver, BC", "Burnaby, BC", "Richmond, BC"],
};

/** Small seeded generator so a repeated search shows the same listings. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353) << 13 | h >>> 19;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9.#+]+/).filter((w) => w.length > 1 && !["senior", "the", "and", "developer", "engineer"].includes(w));

const LEVELS: { prefix: string; mult: number; years: string; note: string }[] = [
  { prefix: "", mult: 1, years: "3+ years", note: "You will work independently and mentor newer teammates." },
  { prefix: "Senior ", mult: 1.2, years: "6+ years", note: "You will lead technical design and set standards for the team." },
  { prefix: "Intermediate ", mult: 0.88, years: "3 to 5 years", note: "You will own well-scoped work and grow into larger projects." },
  { prefix: "Lead ", mult: 1.35, years: "8+ years", note: "You will guide a small team and report to the head of the department." },
];

export function demoJobs(f: SearchFilters, now = new Date()): Job[] {
  const rand = rng(`${f.query.toLowerCase()}|${f.location.toLowerCase()}`);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  const q = words(f.query);
  const scored = TEMPLATES.map((t) => {
    const hay = new Set(words(`${t.title} ${t.skills.join(" ")} ${t.category}`));
    const hits = q.filter((w) => hay.has(w) || [...hay].some((h) => h.startsWith(w) || w.startsWith(h))).length;
    return { t, hits };
  });
  let pool = q.length ? scored.filter((s) => s.hits > 0) : scored;
  if (!pool.length) pool = scored.filter((s) => s.t.category === "Software engineering");
  pool.sort((a, b) => b.hits - a.hits);

  const remoteSearch = isRemoteLocation(f.location);
  const city = cityOf(f.location);
  const places = remoteSearch ? ["Remote, Canada"] : (NEAR[city] ?? [f.location, `${city} (Downtown)`]);
  const currency: "CAD" | "USD" = countriesFor(f.location)[0] === "us" ? "USD" : "CAD";
  const jobs: Job[] = [];

  for (let n = 0; n < 48; n++) {
    const { t } = pool[n % pool.length];
    const level = n < pool.length ? (t.title.startsWith("Senior") ? LEVELS[0] : pick(LEVELS)) : pick(LEVELS);
    const title = t.title.startsWith("Senior") && level.prefix ? t.title : `${level.prefix}${t.title}`;
    const roll = rand();
    const employmentType: EmploymentType = roll < 0.62 ? "Full-time" : roll < 0.9 ? "Contract" : "Part-time";
    const mroll = rand();
    const workMode: WorkMode = remoteSearch ? "Remote" : mroll < 0.3 ? "Remote" : mroll < 0.68 ? "Hybrid" : "On-site";
    const place = workMode === "Remote" && !remoteSearch ? "Remote, Canada" : pick(places);
    const company = pick(COMPANIES);
    const skills = [...t.skills].sort(() => rand() - 0.5);
    const required = skills.slice(0, 4 + Math.floor(rand() * 3));
    const nice = skills.slice(required.length, required.length + 2);

    const basePay: [number, number] = [Math.round((t.pay[0] * level.mult) / 1000) * 1000, Math.round((t.pay[1] * level.mult) / 1000) * 1000];
    const disclosed = rand() > 0.22;
    const hourly = employmentType === "Contract" || employmentType === "Part-time";
    const salary = !disclosed
      ? null
      : hourly
        ? { min: Math.round(basePay[0] / 2080 / 5) * 5, max: Math.round(basePay[1] / 2080 / 5) * 5 + 5, currency, period: "hour" as const, estimated: false }
        : { min: basePay[0], max: basePay[1], currency, period: "year" as const, estimated: false };

    const daysAgo = Math.floor(rand() * rand() * 30);
    const modeLine =
      workMode === "Remote" ? "This role is fully remote within Canada." : workMode === "Hybrid" ? `This is a hybrid role with three days a week in our ${place} office.` : `This role is based on-site in ${place}.`;
    const termLine =
      employmentType === "Contract" ? "This is a 12-month contract with a strong chance of extension." : employmentType === "Part-time" ? "This is a part-time position, 20 to 24 hours a week." : "This is a permanent, full-time position with benefits.";

    const description = [
      `${company} is hiring a ${title}. ${t.blurb}`,
      "",
      modeLine,
      termLine,
      "",
      "What you will do",
      `• ${t.blurb}`,
      `• Work with product, operations and finance partners to define priorities.`,
      `• Review code and data models, and document what you build.`,
      "",
      `What we are looking for (${level.years} of experience)`,
      ...required.map((s) => `• Hands-on experience with ${s}`),
      ...(nice.length ? [`• Nice to have: ${nice.join(", ")}`] : []),
      "",
      level.note,
      "",
      "Sample listing generated for Demo Mode. It is not a real job posting.",
    ].join("\n");

    jobs.push({
      id: `demo-${f.query}-${f.location}-${n}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      company,
      location: place,
      workMode,
      employmentType,
      category: t.category,
      salary,
      postedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
      description,
      descriptionTruncated: false,
      applyUrl: null,
      source: "demo",
      match: null,
    });
  }
  return jobs;
}
