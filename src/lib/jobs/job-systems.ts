/**
 * The only sites whose pages this app reads: services employers use to publish jobs and take applications.
 * The apply link comes from the browser, so the list is what stops the server being pointed at other sites.
 * Matched on the whole host name or a true subdomain, never on a substring.
 */
const JOB_SYSTEMS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "icims.com",
  "taleo.net",
  "bamboohr.com",
  "jobvite.com",
  "successfactors.com",
  "successfactors.eu",
  "ultipro.com",
  "dayforcehr.com",
  "paylocity.com",
  "applytojob.com",
  "breezy.hr",
  "recruitee.com",
  "workable.com",
  "jazz.co",
  "jobs.gc.ca",
  "jobs-emplois.gc.ca",
  "emploisfp-psjobs.cfp-psc.gc.ca",
  "gojobs.gov.on.ca",
];

/** Oracle's recruiting hosts. The rest of oraclecloud.com holds customers' own files, so it is not included. */
const ORACLE_RECRUITING = /\.fa(?:\.[a-z0-9-]{1,30}){0,2}\.oraclecloud\.com$/;

export function isJobSystemUrl(raw: string | URL): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return JOB_SYSTEMS.some((d) => host === d || host.endsWith(`.${d}`)) || ORACLE_RECRUITING.test(host);
}
