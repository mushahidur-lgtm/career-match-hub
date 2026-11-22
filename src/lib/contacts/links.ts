import type { JobCategory } from "@/types/job";
import { inferDepartments } from "./departments";

/**
 * Links that open in the user's own browser or email app. Nothing is fetched or scraped: LinkedIn, Google and Bing are only
 * ever visited by the person, who stays signed in to their own account and sees the results themselves.
 */

export const linkedinPeopleSearch = (company: string, extra = "recruiter") =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${extra} ${company}`.trim())}`;

export const googleSearch = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

export const bingSearch = (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

export type ResearchEngine = "Google" | "Bing" | "LinkedIn";

export interface ResearchLink {
  label: string;
  href: string;
  engine: ResearchEngine;
  /** What is typed into the search, so the person can see exactly what will be looked for. */
  query: string;
}

export interface ResearchGroup {
  id: "recruiter" | "talent" | "manager" | "department" | "careers";
  title: string;
  links: ResearchLink[];
}

/** A quote or newline inside a name would change what the search means, so they are removed. */
const plain = (s: string) => s.replace(/["“”\n\r]+/g, " ").replace(/\s+/g, " ").trim();

const NO_COMPANY = /^company not listed$/i;

/**
 * The searches a person can run for the people hiring for one job, grouped by who they find. Every link is a search the
 * person opens themselves: nothing is opened, read or collected automatically, and no profile address is ever built.
 * Returns nothing when the employer is not known, because a search without a company would find unrelated people.
 */
export function researchLinks(job: { company: string; title: string; category?: string; description?: string; location?: string }): ResearchGroup[] {
  const company = plain(job.company);
  if (!company || NO_COMPANY.test(company)) return [];
  const title = plain(job.title);
  const city = plain((job.location ?? "").split(",")[0] ?? "");
  const [dept] = inferDepartments({ title, category: (job.category ?? "Other") as JobCategory, description: job.description ?? "" });

  const both = (label: string, query: string): ResearchLink[] => [
    { label: `${label} on Google`, href: googleSearch(query), engine: "Google", query },
    { label: `${label} on Bing`, href: bingSearch(query), engine: "Bing", query },
  ];
  const linkedin = (label: string, keywords: string): ResearchLink => ({ label: `${label} on LinkedIn`, href: linkedinPeopleSearch(company, keywords), engine: "LinkedIn", query: `${keywords} ${company}` });

  const groups: ResearchGroup[] = [
    {
      id: "recruiter",
      title: "Recruiter for this job",
      links: [...both("Recruiter for this job", `"${company}" recruiter "${title}"`), linkedin("Recruiters", "recruiter")],
    },
    {
      id: "talent",
      title: "Talent acquisition",
      links: [...both("Talent acquisition team", `"${company}" "talent acquisition"${city ? ` ${city}` : ""}`), linkedin("Talent acquisition", '"talent acquisition"')],
    },
    {
      id: "manager",
      title: "Hiring manager",
      links: [...both("Hiring manager", `"${company}" "hiring manager" "${title}"`), linkedin("Hiring managers", dept ? `"hiring manager" ${dept}` : '"hiring manager"')],
    },
  ];
  if (dept) {
    groups.push({
      id: "department",
      title: `${dept} leaders`,
      links: [...both(`${dept} leaders`, `"${company}" ${dept} director OR manager OR "head of"`), linkedin(`${dept} leaders`, `${dept} director OR manager`)],
    });
  }
  groups.push({
    id: "careers",
    title: "Company careers page",
    links: [...both("Careers page", `"${company}" careers`), ...both("Careers team and contact", `"${company}" careers "contact" OR "recruitment" OR "talent"`)],
  });
  return groups;
}

/** An email link with the draft filled in. It only opens the person's email app: they review it and send it themselves. */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Only ordinary web addresses are ever used as links. */
export function webLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
