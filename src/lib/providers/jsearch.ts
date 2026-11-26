import type { EmploymentType, EmploymentTypeFilter, Job, SalaryPeriod, SearchFilters } from "@/types/job";
import {
  countriesFor,
  fetchJson,
  inferCategory,
  inferEmploymentType,
  inferWorkMode,
  isRemoteLocation,
  stripHtml,
} from "./common";

/** Subset of the JSearch job object (from the OpenWeb Ninja documentation). */
interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name?: string;
  job_employment_type?: string;
  job_employment_types?: string[];
  job_apply_link?: string;
  job_description?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;
  job_location?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_offer_expiration_datetime_utc?: string | null;
}

/** The classic /search endpoint returns data as an array; the newer /search-v2 nests it under data.jobs. */
interface JSearchResponse {
  data?: JSearchJob[] | { jobs?: JSearchJob[] };
  dataResults?: { jobs?: JSearchJob[] };
}

export const jsearchConfigured = () => Boolean(process.env.RAPIDAPI_KEY?.trim());

const TYPE_PARAM: Partial<Record<EmploymentTypeFilter, string>> = {
  "Permanent full-time": "FULLTIME",
  "Full-time": "FULLTIME",
  Contract: "CONTRACTOR",
  "Part-time": "PARTTIME",
};

function employmentOf(j: JSearchJob, description: string): EmploymentType {
  const types = j.job_employment_types?.length ? j.job_employment_types : j.job_employment_type ? [j.job_employment_type] : [];
  const norm = types.map((t) => t.toUpperCase().replace(/[^A-Z]/g, ""));
  if (norm.includes("CONTRACTOR") || norm.includes("CONTRACT")) return "Contract";
  if (norm.includes("PARTTIME")) return "Part-time";
  if (norm.includes("INTERN")) return "Internship";
  if (norm.includes("FULLTIME")) return inferEmploymentType(j.job_title, description) === "Contract" ? "Contract" : "Full-time";
  return inferEmploymentType(j.job_title, description);
}

const PERIODS: Record<string, [SalaryPeriod, number]> = {
  YEAR: ["year", 1], MONTH: ["year", 12], WEEK: ["year", 52], DAY: ["year", 260], HOUR: ["hour", 1],
};

function normalize(j: JSearchJob): Job {
  const description = stripHtml(j.job_description ?? "");
  const [period, factor] = PERIODS[(j.job_salary_period ?? "YEAR").toUpperCase()] ?? PERIODS.YEAR;
  const min = typeof j.job_min_salary === "number" ? Math.round(j.job_min_salary * factor) : null;
  const max = typeof j.job_max_salary === "number" ? Math.round(j.job_max_salary * factor) : null;
  const place = j.job_location || [j.job_city, j.job_state].filter(Boolean).join(", ") || j.job_country || "Location not listed";
  const posted = j.job_posted_at_datetime_utc ?? (j.job_posted_at_timestamp ? new Date(j.job_posted_at_timestamp * 1000).toISOString() : null);
  return {
    id: `jsearch-${j.job_id}`,
    title: j.job_title,
    company: j.employer_name?.trim() || "Company not listed",
    location: place,
    workMode: inferWorkMode(j.job_title, description, j.job_is_remote),
    employmentType: employmentOf(j, description),
    category: inferCategory(j.job_title, description),
    salary:
      min !== null || max !== null
        ? { min, max, currency: j.job_country?.toUpperCase() === "CA" || j.job_salary_currency === "CAD" ? "CAD" : "USD", period, estimated: false }
        : null,
    postedAt: posted,
    description,
    descriptionTruncated: false,
    applyUrl: j.job_apply_link ?? null,
    source: "jsearch",
    match: null,
    ...(Date.parse(j.job_offer_expiration_datetime_utc ?? "") < Date.now()
      ? { postingStatus: "expired" as const, postingNotes: ["The job board's closing date has passed"] }
      : {}),
  };
}

export async function searchJSearch(f: SearchFilters): Promise<Job[]> {
  const remote = isRemoteLocation(f.location);
  const countries = countriesFor(f.location);
  const role = f.query.trim() || "jobs";

  const runs = countries.map(async (country) => {
    const params = new URLSearchParams({
      query: remote ? role : `${role} in ${f.location}`,
      page: "1",
      num_pages: "2",
      country,
      date_posted: "month",
    });
    if (remote || f.workMode === "Remote") params.set("work_from_home", "true");
    const typeParam = TYPE_PARAM[f.employmentType];
    if (typeParam) params.set("employment_types", typeParam);
    const data = await fetchJson<JSearchResponse>(
      `https://jsearch.p.rapidapi.com/search?${params}`,
      { headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!.trim(), "X-RapidAPI-Host": "jsearch.p.rapidapi.com" } },
      "JSearch",
    );
    const list = Array.isArray(data.data) ? data.data : (data.data?.jobs ?? data.dataResults?.jobs ?? []);
    return list.filter((j) => j?.job_id && j.job_title).map(normalize);
  });

  return (await Promise.all(runs)).flat();
}

/** The full text of one posting from JSearch's own detail endpoint, or null when it has none. */
export async function jsearchDetails(jobId: string): Promise<string | null> {
  const params = new URLSearchParams({ job_id: jobId });
  const data = await fetchJson<{ data?: JSearchJob[] }>(
    `https://jsearch.p.rapidapi.com/job-details?${params}`,
    { headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY!.trim(), "X-RapidAPI-Host": "jsearch.p.rapidapi.com" } },
    "JSearch",
  );
  const found = Array.isArray(data.data) ? data.data[0] : undefined;
  return found?.job_description ? stripHtml(found.job_description) : null;
}
