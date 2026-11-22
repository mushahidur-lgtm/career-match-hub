import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredProvider, demoEnabled, fetchJobs } from "@/lib/providers";
import { searchAdzuna } from "@/lib/providers/adzuna";
import { searchJSearch } from "@/lib/providers/jsearch";
import { DEFAULT_FILTERS, type SearchFilters } from "@/types/job";

const filters = (over: Partial<SearchFilters> = {}): SearchFilters => ({ ...DEFAULT_FILTERS, query: "Data Engineer", ...over });

function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url);
      return handler(url, init);
    }),
  );
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("ADZUNA_APP_ID", "");
  vi.stubEnv("ADZUNA_APP_KEY", "");
  vi.stubEnv("RAPIDAPI_KEY", "");
  vi.stubEnv("CMH_DEMO", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("no fabricated jobs in production", () => {
  it("returns nothing and says no provider is connected", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(demoEnabled()).toBe(false);
    expect(configuredProvider()).toBe("none");
    const r = await fetchJobs(filters());
    expect(r.jobs).toEqual([]);
    expect(r.provider).toBe("none");
  });

  it("only produces sample jobs when demo is switched on, and labels them", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CMH_DEMO", "1");
    const r = await fetchJobs(filters());
    expect(r.provider).toBe("demo");
    expect(r.jobs.length).toBeGreaterThan(0);
    expect(r.jobs.every((j) => j.source === "demo" && j.applyUrl === null)).toBe(true);
  });

  it("returns no jobs, not sample jobs, when a live provider fails in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    mockFetch(() => json({}, 500));
    const r = await fetchJobs(filters());
    expect(r.jobs).toEqual([]);
    expect(r.provider).toBe("adzuna");
    expect(r.warnings.join(" ")).toMatch(/Adzuna returned an error \(500\)/);
  });
});

describe("Adzuna", () => {
  beforeEach(() => {
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
  });

  const raw = (over = {}) => ({
    id: "42",
    title: "Data Engineer",
    description: "Build pipelines.",
    created: "2026-11-20T00:00:00Z",
    redirect_url: "https://www.adzuna.ca/land/ad/42",
    company: { display_name: "Acme" },
    location: { display_name: "Ottawa, Ontario" },
    ...over,
  });

  it("asks for full-time roles, never sends a salary floor, and widens the Toronto area", async () => {
    const calls = mockFetch(() => json({ results: [] }));
    await searchAdzuna(filters({ location: "Greater Toronto Area, ON", minSalary: 100_000 }));
    const q = calls[0].searchParams;
    expect(calls[0].pathname).toBe("/v1/api/jobs/ca/search/1");
    expect(q.get("full_time")).toBe("1");
    expect(q.has("salary_min")).toBe(false);
    expect(q.get("where")).toBe("Toronto");
    expect(q.get("distance")).toBe("60");
    expect(q.get("what")).toBe("Data Engineer");
  });

  it("does not send a location for remote searches and adds the word remote", async () => {
    const calls = mockFetch(() => json({ results: [] }));
    await searchAdzuna(filters({ location: "Remote - Canada" }));
    expect(calls[0].searchParams.has("where")).toBe(false);
    expect(calls[0].searchParams.get("what")).toBe("Data Engineer remote");
  });

  it("marks predicted salaries as estimated and reads contract type", async () => {
    mockFetch(() => json({ results: [raw({ salary_min: 90_000, salary_max: 110_000, salary_is_predicted: "1", contract_type: "contract" })] }));
    const [job] = await searchAdzuna(filters());
    expect(job.salary?.estimated).toBe(true);
    expect(job.employmentType).toBe("Contract");
    expect(job.descriptionTruncated).toBe(true);
    expect(job.id).toBe("adzuna-42");
  });

  it("treats a missing salary as unknown, never as zero", async () => {
    mockFetch(() => json({ results: [raw()] }));
    const [job] = await searchAdzuna(filters());
    expect(job.salary).toBeNull();
  });

  it("surfaces rejected credentials clearly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockFetch(() => json({}, 401));
    const r = await fetchJobs(filters());
    expect(r.warnings[0]).toBe("Adzuna rejected the API credentials.");
  });
});

describe("JSearch", () => {
  beforeEach(() => vi.stubEnv("RAPIDAPI_KEY", "rk"));

  const raw = (over = {}) => ({
    job_id: "abc",
    job_title: "Azure Data Engineer",
    employer_name: "Globex",
    job_employment_types: ["FULLTIME"],
    job_apply_link: "https://globex.example/apply",
    job_description: "Work with Azure Data Factory.",
    job_is_remote: false,
    job_posted_at_datetime_utc: "2026-11-18T00:00:00.000Z",
    job_city: "Toronto",
    job_state: "Ontario",
    job_country: "CA",
    ...over,
  });

  it("sends the key as headers and requests full-time roles", async () => {
    const calls = mockFetch(() => json({ data: [] }));
    let headers: HeadersInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push(new URL(String(input)));
      headers = init?.headers;
      return json({ data: [] });
    }));
    await searchJSearch(filters({ location: "Ottawa, ON" }));
    const q = calls[calls.length - 1].searchParams;
    expect(q.get("employment_types")).toBe("FULLTIME");
    expect(q.get("query")).toBe("Data Engineer in Ottawa, ON");
    expect((headers as Record<string, string>)["X-RapidAPI-Key"]).toBe("rk");
  });

  it("reads both the array and the nested response shapes", async () => {
    mockFetch(() => json({ data: [raw()] }));
    expect(await searchJSearch(filters())).toHaveLength(1);
    mockFetch(() => json({ data: { jobs: [raw()] } }));
    expect(await searchJSearch(filters())).toHaveLength(1);
  });

  it("converts monthly pay to yearly and keeps the posting date as given", async () => {
    mockFetch(() => json({ data: [raw({ job_min_salary: 8000, job_max_salary: 10000, job_salary_period: "MONTH" })] }));
    const [job] = await searchJSearch(filters());
    expect(job.salary).toMatchObject({ min: 96_000, max: 120_000, period: "year", currency: "CAD", estimated: false });
    expect(job.postedAt).toBe("2026-11-18T00:00:00.000Z");
    expect(job.employmentType).toBe("Full-time");
  });

  it("leaves the posting date empty when the provider gives none", async () => {
    mockFetch(() => json({ data: [raw({ job_posted_at_datetime_utc: undefined })] }));
    const [job] = await searchJSearch(filters());
    expect(job.postedAt).toBeNull();
  });

  it("falls through to JSearch when Adzuna fails", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    mockFetch((url) => (url.hostname.includes("adzuna") ? json({}, 429) : json({ data: [raw()] })));
    const r = await fetchJobs(filters());
    expect(r.provider).toBe("jsearch");
    expect(r.jobs).toHaveLength(1);
    expect(r.warnings).toContain("Adzuna rate limit reached.");
  });
});
