import type { EmploymentType, Job, SearchFilters } from "@/types/job";
import {
  cityOf,
  countriesFor,
  fetchJson,
  inferCategory,
  inferEmploymentType,
  inferWorkMode,
  isRemoteLocation,
  stripHtml,
} from "./common";

/** Fields documented in Adzuna's search spec. All but id, title, description and created are optional. */
interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_time?: "full_time" | "part_time";
  contract_type?: "permanent" | "contract";
}
interface AdzunaResponse {
  results?: AdzunaJob[];
}

export const adzunaConfigured = () => Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());

function employmentOf(j: AdzunaJob): EmploymentType {
  if (j.contract_type === "contract") return "Contract";
  if (j.contract_time === "part_time") return "Part-time";
  const inferred = inferEmploymentType(j.title, j.description ?? "");
  if (inferred !== "Not stated") return inferred;
  return j.contract_time === "full_time" ? "Full-time" : "Not stated";
}

function normalize(j: AdzunaJob, country: "ca" | "us"): Job {
  const description = stripHtml(j.description ?? "");
  const hasSalary = typeof j.salary_min === "number" || typeof j.salary_max === "number";
  return {
    id: `adzuna-${j.id}`,
    title: stripHtml(j.title),
    company: j.company?.display_name?.trim() || "Company not listed",
    location: j.location?.display_name?.trim() || (country === "ca" ? "Canada" : "United States"),
    workMode: inferWorkMode(j.title, description),
    employmentType: employmentOf(j),
    category: inferCategory(j.title, description),
    salary: hasSalary
      ? {
          min: j.salary_min ?? null,
          max: j.salary_max ?? null,
          currency: country === "ca" ? "CAD" : "USD",
          period: "year",
          estimated: String(j.salary_is_predicted) === "1",
        }
      : null,
    postedAt: j.created || null,
    description,
    // Adzuna cuts descriptions to 500 characters; the Apply link has the rest.
    descriptionTruncated: true,
    applyUrl: j.redirect_url ?? null,
    source: "adzuna",
    match: null,
  };
}

export async function searchAdzuna(f: SearchFilters): Promise<Job[]> {
  const remote = isRemoteLocation(f.location);
  const countries = countriesFor(f.location);
  const keywords = [f.query.trim(), remote || f.workMode === "Remote" ? "remote" : ""].filter(Boolean).join(" ");

  const runs = countries.map(async (country) => {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!.trim(),
      app_key: process.env.ADZUNA_APP_KEY!.trim(),
      results_per_page: String(countries.length > 1 ? 25 : 50),
      sort_by: "relevance",
    });
    if (keywords) params.set("what", keywords);
    if (!remote) {
      params.set("where", cityOf(f.location));
      params.set("distance", "30");
    }
    if (f.employmentType === "Full-time") params.set("full_time", "1");
    if (f.employmentType === "Contract") params.set("contract", "1");
    if (f.employmentType === "Part-time") params.set("part_time", "1");
    if (f.minSalary) {
      params.set("salary_min", String(f.minSalary));
      // Without this Adzuna drops every posting that has no salary.
      params.set("salary_include_unknown", "1");
    }
    const data = await fetchJson<AdzunaResponse>(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`,
      { headers: { Accept: "application/json" } },
      "Adzuna",
    );
    return (data.results ?? []).map((j) => normalize(j, country));
  });

  return (await Promise.all(runs)).flat();
}
