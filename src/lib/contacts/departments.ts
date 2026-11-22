import type { Job } from "@/types/job";

/**
 * Which part of a company hires for a job, worked out from the job itself, so the search can look for the recruiters
 * and managers of the right team instead of any HR person.
 */

interface Rule {
  /** Matched against the job title (and category and the start of the description). */
  test: RegExp;
  departments: string[];
}

const RULES: Rule[] = [
  { test: /data (?:engineer|architect|platform|warehouse)|etl|analytics engineer|bi developer|business intelligence|data scien|machine learning|\bml\b|ai\b/i, departments: ["Data", "Analytics", "Engineering"] },
  { test: /data analyst|reporting analyst|insights/i, departments: ["Data", "Analytics", "Business Intelligence"] },
  { test: /software|developer|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|\.net|java\b|python|devops|cloud|sre|site reliability|platform engineer|application|integration/i, departments: ["Technology", "Software Engineering", "IT"] },
  { test: /security|cyber|infosec|soc analyst/i, departments: ["Cybersecurity", "Information Security", "IT"] },
  { test: /financ|account|audit|controller|treasury|payroll|actuar|fp&a/i, departments: ["Finance", "Accounting"] },
  { test: /business analyst|digital transformation|process improvement|product owner|project manager|program manager|scrum/i, departments: ["Business", "Digital Transformation", "Project Delivery"] },
  { test: /policy|program officer|regulat|public service|government|municipal|ministry|federal|provincial/i, departments: ["Policy", "Public Service", "Government"] },
  { test: /nurse|physician|clinical|health|medical|pharmac|patient|hospital|therap/i, departments: ["Clinical", "Health Services", "Healthcare"] },
  { test: /consult|advisory|engagement manager|associate partner/i, departments: ["Consulting", "Advisory"] },
  { test: /market|brand|communications|content|seo|growth/i, departments: ["Marketing", "Communications"] },
  { test: /sales|account executive|business development|customer success/i, departments: ["Sales", "Business Development"] },
  { test: /legal|counsel|compliance|paralegal/i, departments: ["Legal", "Compliance"] },
  { test: /engineer|mechanical|electrical|civil|manufactur/i, departments: ["Engineering", "Operations"] },
];

const GENERAL = ["Technology"];

/** The teams most likely to hire for this job, best first, at most four. Falls back to the job category. */
export function inferDepartments(job: Pick<Job, "title" | "category" | "description">): string[] {
  const out: string[] = [];
  const add = (xs: string[]) => xs.forEach((x) => out.includes(x) || out.push(x));
  for (const r of RULES) if (r.test.test(job.title)) add(r.departments);
  if (!out.length) for (const r of RULES) if (r.test.test(`${job.category} ${job.description.slice(0, 400)}`)) add(r.departments);
  if (!out.length) add(job.category === "Other" ? GENERAL : [job.category]);
  return out.slice(0, 4);
}

/**
 * The searches to run for one job, in order of how directly they find the right person. The model is told to run them,
 * and the page lists them afterwards, so you can see exactly what was looked for.
 */
export function buildQueryPlan(job: Pick<Job, "title" | "company" | "category" | "description" | "location">): string[] {
  const co = job.company.trim();
  const [d1, d2] = inferDepartments(job);
  const plan = [
    `"${co}" "${job.title}" recruiter`,
    `"${co}" "Talent Acquisition"`,
    `"${co}" "Technical Recruiter"`,
    d1 ? `"${co}" ${d1}${d2 ? ` ${d2}` : ""} recruiter` : null,
    `"${co}" "HR Manager" OR "HR Business Partner"`,
    `"${co}" "Hiring Manager" ${d1 ?? ""}`.trim(),
    `${co} careers talent team`,
    `${co} recruiter OR "talent acquisition" site:linkedin.com/in`,
  ];
  return plan.filter((q): q is string => Boolean(q));
}

/** The city a job is in, for matching a contact's location. Remote jobs have none. */
export function jobCity(location: string): string {
  const first = location.split(",")[0].trim().toLowerCase();
  return /^remote\b|^canada$|^ontario$/.test(first) ? "" : first;
}
