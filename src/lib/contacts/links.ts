/**
 * Links that open in the user's own browser or email app. Nothing is fetched or scraped: LinkedIn and Google are only
 * ever visited by the person, who stays signed in to their own account and sees the results themselves.
 */

export const linkedinPeopleSearch = (company: string, extra = "recruiter") =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${extra} ${company}`.trim())}`;

export const googleSearch = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

/** Searches a person can run to look for the people hiring for a job. */
export function searchLinks(company: string, jobTitle: string): { label: string; href: string }[] {
  return [
    { label: "Recruiters at this company on LinkedIn", href: linkedinPeopleSearch(company, "recruiter OR \"talent acquisition\"") },
    { label: "HR contacts at this company on LinkedIn", href: linkedinPeopleSearch(company, "\"human resources\" OR HR") },
    { label: "This job's posting on Google", href: googleSearch(`"${jobTitle}" ${company} recruiter OR "talent acquisition" OR "hiring manager"`) },
  ];
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
