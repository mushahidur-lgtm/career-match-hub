import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyze } from "@/app/api/analyze-resume/route";
import { POST as parse } from "@/app/api/parse-resume/route";
import { POST as search } from "@/app/api/search-jobs/route";
import { DEFAULT_FILTERS } from "@/types/job";

let n = 0;
const post = (url: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", body, headers: { "x-forwarded-for": `10.0.0.${++n}`, ...headers } });
const jsonReq = (url: string, body: unknown) => post(url, JSON.stringify(body), { "content-type": "application/json" });
const fileReq = (name: string, content: BlobPart) => {
  const form = new FormData();
  form.append("file", new File([content], name));
  return post("/api/parse-resume", form);
};

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ADZUNA_APP_ID", "");
  vi.stubEnv("RAPIDAPI_KEY", "");
  vi.stubEnv("CMH_DEMO", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const RESUME = "Senior Data Engineer with 9 years of experience. Built ETL pipelines in Python and SQL on Azure Data Factory and Snowflake. Reported in Power BI.";

describe("parse-resume", () => {
  it("reads a text file", async () => {
    const res = await parse(fileReq("cv.txt", RESUME));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toContain("Azure Data Factory");
  });
  it("rejects a missing file", async () => {
    const res = await parse(post("/api/parse-resume", new FormData()));
    expect(res.status).toBe(400);
  });
  it("rejects an unsupported type", async () => {
    expect((await parse(fileReq("virus.exe", "MZ..."))).status).toBe(415);
  });
  it("rejects a file that claims to be a PDF but is not", async () => {
    const res = await parse(fileReq("cv.pdf", "this is plain text pretending to be a pdf file......"));
    expect(res.status).toBe(415);
  });
  it("rejects an empty file and one over the size limit", async () => {
    expect((await parse(fileReq("cv.txt", ""))).status).toBe(400);
    expect((await parse(fileReq("cv.txt", new Uint8Array(4 * 1024 * 1024 + 1)))).status).toBe(413);
  });
  it("rejects a file with almost no text", async () => {
    expect((await parse(fileReq("cv.txt", "hi there"))).status).toBe(422);
  });
  it("rate limits a client that hammers it", async () => {
    const ip = { "x-forwarded-for": "9.9.9.9" };
    const make = () => {
      const form = new FormData();
      form.append("file", new File([RESUME], "cv.txt"));
      return new Request("http://localhost/api/parse-resume", { method: "POST", body: form, headers: ip });
    };
    let last = 200;
    for (let i = 0; i < 22; i++) last = (await parse(make())).status;
    expect(last).toBe(429);
  });
});

describe("analyze-resume without a key", () => {
  it("returns a keyword profile", async () => {
    const res = await analyze(jsonReq("/api/analyze-resume", { text: RESUME }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.source).toBe("heuristic");
    expect(body.profile.skills.languages).toContain("Python");
  });
  it("rejects text that is too short or not JSON", async () => {
    expect((await analyze(jsonReq("/api/analyze-resume", { text: "hi" }))).status).toBe(400);
    expect((await analyze(post("/api/analyze-resume", "{nope", { "content-type": "application/json" }))).status).toBe(400);
  });
});

describe("search-jobs", () => {
  it("rejects filters that fail validation", async () => {
    const res = await search(jsonReq("/api/search-jobs", { filters: { ...DEFAULT_FILTERS, employmentType: "Freelance" }, profile: null }));
    expect(res.status).toBe(400);
  });
  it("accepts the new permanent full-time filter and reports that no source is connected", async () => {
    const res = await search(jsonReq("/api/search-jobs", { filters: DEFAULT_FILTERS, profile: null }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe("unconfigured");
    expect(body.jobs).toEqual([]);
  });
});
