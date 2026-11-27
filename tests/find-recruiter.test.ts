import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages/messages";

const search = vi.hoisted(() => ({ searchWeb: vi.fn() }));
const auth = vi.hoisted(() => ({ requireSignedIn: vi.fn() }));

vi.mock("@/lib/contacts/web-search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contacts/web-search")>("@/lib/contacts/web-search");
  return { ...actual, searchWeb: search.searchWeb };
});
vi.mock("@/lib/cloud/auth", () => ({ requireSignedIn: auth.requireSignedIn }));

import { POST, type FindRecruiterResponse, type StreamLine } from "@/app/api/find-recruiter/route";
import { BLOCKED_FETCH_DOMAINS, mergeParsed, parseCandidatesBlock, parseResponse, userPrompt } from "@/lib/contacts/web-search";

const call = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://x/api/find-recruiter", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

/** A lookup answers as a stream of lines. Refusals answer with plain JSON. */
async function lines(res: Response): Promise<StreamLine[]> {
  return (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as StreamLine);
}
async function resultOf(res: Response): Promise<FindRecruiterResponse> {
  const r = (await lines(res)).find((l) => l.type === "result");
  if (!r || r.type !== "result") throw new Error("no result line");
  return r.result;
}

const job = { jobKey: "senior data engineer|acme analytics|ottawa", title: "Senior Data Engineer", company: "Acme Analytics", location: "Ottawa, ON", applyUrl: "https://careers.acme.example/jobs/123", source: "adzuna" as const };
const usage = { searches: 3, fetches: 1, inputTokens: 1000, outputTokens: 200 };
const okParsed = (over: object = {}) => ({ searches: 0, fetches: 0, queries: [], readHosts: [], toolErrors: [], evidence: { results: [], citations: [], pages: [] }, raw: [], ...over });
const ok = (parsed: object) => ({ ok: true, model: "m", parsed, usage });

let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
  vi.stubEnv("RECRUITER_WEB_SEARCH", "1");
  search.searchWeb.mockReset();
  auth.requireSignedIn.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

/* ---------- reading the model's response ---------- */

const blocks = (items: unknown[]) => items as unknown as ContentBlock[];

describe("reading a web search response", () => {
  const content = blocks([
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "acme recruiter" }, caller: { type: "direct" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      caller: { type: "direct" },
      content: [
        { type: "web_search_result", url: "https://careers.acme.example/team", title: "Team - Acme", encrypted_content: "x", page_age: null },
        { type: "web_search_result", url: "https://www.linkedin.com/in/jane-smith-ta", title: "Jane Smith - Talent Acquisition Partner - Acme | LinkedIn", encrypted_content: "y", page_age: null },
      ],
    },
    { type: "server_tool_use", id: "f1", name: "web_fetch", input: { url: "https://careers.acme.example/team" }, caller: { type: "direct" } },
    {
      type: "web_fetch_tool_result",
      tool_use_id: "f1",
      caller: { type: "direct" },
      content: { type: "web_fetch_result", url: "https://careers.acme.example/team", retrieved_at: null, content: { type: "document", title: "Our team", citations: null, source: { type: "text", media_type: "text/plain", data: "Jane Smith, Talent Acquisition Partner, Ottawa\nOmar Ali, HR Manager" } } },
    },
    {
      type: "text",
      text: "Jane Smith is the Talent Acquisition Partner.\n",
      citations: [{ type: "web_search_result_location", url: "https://careers.acme.example/team", title: "Team", cited_text: "Jane Smith, Talent Acquisition Partner at Acme Analytics", encrypted_index: "i" }],
    },
    { type: "text", text: "CANDIDATES\nJane Smith | Talent Acquisition Partner | Talent | Ottawa, ON | https://www.linkedin.com/in/jane-smith-ta | | | https://careers.acme.example/team, https://www.linkedin.com/in/jane-smith-ta | Recruits for data roles", citations: null },
  ]);

  it("collects results, the full text of pages that were read, cited passages, the searches run and the claimed people", () => {
    const p = parseResponse(content);
    expect(p.searches).toBe(1);
    expect(p.fetches).toBe(1);
    expect(p.queries).toEqual(["acme recruiter"]);
    expect(p.readHosts).toEqual(["careers.acme.example"]);
    expect(p.evidence.results.map((r) => r.url)).toEqual(["https://careers.acme.example/team", "https://www.linkedin.com/in/jane-smith-ta"]);
    expect(p.evidence.pages).toEqual([{ url: "https://careers.acme.example/team", title: "Our team", text: "Jane Smith, Talent Acquisition Partner, Ottawa\nOmar Ali, HR Manager" }]);
    expect(p.evidence.citations).toHaveLength(1);
    expect(p.raw).toHaveLength(1);
    expect(p.raw[0]).toMatchObject({ name: "Jane Smith", title: "Talent Acquisition Partner", department: "Talent", location: "Ottawa, ON", note: "Recruits for data roles" });
    expect(p.raw[0].sourceUrls).toHaveLength(2);
    expect(p.raw[0].email).toBeUndefined();
  });

  it("reports a tool error, from a search or a page read, instead of results", () => {
    const search = parseResponse(blocks([{ type: "web_search_tool_result", tool_use_id: "s1", caller: { type: "direct" }, content: { type: "web_search_tool_result_error", error_code: "unavailable" } }]));
    expect(search.toolErrors).toEqual(["unavailable"]);
    expect(search.evidence.results).toEqual([]);
    const fetch = parseResponse(blocks([{ type: "web_fetch_tool_result", tool_use_id: "f1", caller: { type: "direct" }, content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" } }]));
    expect(fetch.toolErrors).toEqual(["url_not_accessible"]);
    expect(fetch.evidence.pages).toEqual([]);
  });

  it("ignores a PDF it cannot read as text, and reads NONE, a missing block, list markers and the older eight-column format", () => {
    const pdf = parseResponse(blocks([{ type: "web_fetch_tool_result", tool_use_id: "f1", caller: { type: "direct" }, content: { type: "web_fetch_result", url: "https://a.example/x.pdf", retrieved_at: null, content: { type: "document", title: null, citations: null, source: { type: "base64", media_type: "application/pdf", data: "AAAA" } } } }]));
    expect(pdf.evidence.pages).toEqual([]);
    expect(parseCandidatesBlock("Nothing found.\nCANDIDATES\nNONE")).toEqual([]);
    expect(parseCandidatesBlock("No block here")).toEqual([]);
    expect(parseCandidatesBlock("CANDIDATES\n- Jane Smith | Recruiter | | | | | https://a.example/x |")).toHaveLength(1);
    expect(parseCandidatesBlock("CANDIDATES\nJane Smith | Recruiter | Data | | | | https://a.example/x | note")[0].location).toBeUndefined();
    expect(parseCandidatesBlock("CANDIDATES\n\n  \njust text without pipes")).toEqual([]);
  });

  it("combines the rounds of one search, which the API can pause and continue", () => {
    const a = parseResponse(content);
    const b = parseResponse(blocks([{ type: "server_tool_use", id: "s2", name: "web_search", input: { query: "acme hr manager" }, caller: { type: "direct" } }]));
    const m = mergeParsed([a, b]);
    expect(m.searches).toBe(2);
    expect(m.queries).toEqual(["acme recruiter", "acme hr manager"]);
    expect(m.evidence.pages).toHaveLength(1);
  });
});

describe("the search plan", () => {
  it("asks for the strategy in order, with the teams that would hire, and never lets LinkedIn be fetched", () => {
    const p = userPrompt({ company: "Acme Analytics", jobTitle: "Senior Data Engineer", category: "Data and analytics", description: "Build pipelines", location: "Ottawa, ON", applyHost: "careers.acme.example" });
    expect(p).toContain('"Acme Analytics" "Senior Data Engineer" recruiter');
    expect(p).toContain('"Talent Acquisition"');
    expect(p).toContain('"Technical Recruiter"');
    expect(p).toContain('"HR Manager"');
    expect(p).toContain('"Hiring Manager"');
    expect(p).toMatch(/Teams that probably hire for this job: Data, Analytics, Engineering/);
    expect(BLOCKED_FETCH_DOMAINS).toContain("linkedin.com");
    expect(BLOCKED_FETCH_DOMAINS).toContain("www.linkedin.com");
  });
  it("a follow-up search names the people already found, so it looks for others", () => {
    const p = userPrompt({ company: "Acme", jobTitle: "Data Engineer", category: "Other", description: "", location: "", applyHost: null, exclude: ["Jane Smith"], pass: 2 });
    expect(p).toMatch(/already found[\s\S]*Jane Smith/);
    expect(p).toMatch(/follow-up search/);
  });
});

/* ---------- the route ---------- */

describe("the Find Recruiter route", () => {
  it("never searches for a sample job", async () => {
    const res = await call({ ...job, source: "demo" }, nextIp());
    const body = await res.json();
    expect(search.searchWeb).not.toHaveBeenCalled();
    expect(body.candidates).toEqual([]);
    expect(body.note).toMatch(/sample job/i);
  });

  it("never searches when the employer is not named", async () => {
    const body = await (await call({ ...job, company: "Company not listed" }, nextIp())).json();
    expect(search.searchWeb).not.toHaveBeenCalled();
    expect(body.note).toMatch(/does not name the employer/i);
  });

  it("says so, without error, when there is no Anthropic key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await call(job, nextIp());
    expect(res.status).toBe(200);
    expect((await res.json()).note).toMatch(/switched off/);
    expect(search.searchWeb).not.toHaveBeenCalled();
  });

  it("an Anthropic key alone does not open paid searches to everyone: it needs the owner opt-in", async () => {
    vi.stubEnv("RECRUITER_WEB_SEARCH", "");
    const res = await call(job, nextIp());
    expect((await res.json()).note).toMatch(/switched off.*costs money/);
    expect(search.searchWeb).not.toHaveBeenCalled();
    // Signing in is not enough either: paid lookups need the opt-in as well.
    vi.stubEnv("RECRUITER_WEB_SEARCH", "1");
    search.searchWeb.mockResolvedValue(ok(okParsed()));
    await (await call(job, nextIp())).text();
    expect(search.searchWeb).toHaveBeenCalledTimes(1);
  });

  it("refusals do not use up the visitor lookup limit", async () => {
    const ip = nextIp();
    for (let i = 0; i < 6; i++) await call({ ...job, source: "demo" }, ip);
    search.searchWeb.mockResolvedValue(ok(okParsed()));
    expect((await call(job, ip)).status).toBe(200);
  });

  it("refuses someone who is not signed in, before any search is paid for", async () => {
    auth.requireSignedIn.mockResolvedValue({ ok: false, status: 401, error: "Sign in under Settings, Cloud sync to use this." });
    const res = await call(job, nextIp());
    expect(res.status).toBe(401);
    expect(search.searchWeb).not.toHaveBeenCalled();
  });

  it("rejects a malformed request", async () => {
    expect((await call({ title: "x" }, nextIp())).status).toBe(400);
  });

  it("streams progress while it works, then the verified result with what was searched and what it cost", async () => {
    search.searchWeb.mockImplementation(async (_input: unknown, onProgress?: (m: string) => void) => {
      onProgress?.("Searching: acme recruiter");
      onProgress?.("Reading careers.acme.example");
      return ok(
        okParsed({
          searches: 3,
          fetches: 1,
          queries: ["acme recruiter", "acme talent acquisition"],
          readHosts: ["careers.acme.example"],
          evidence: {
            results: [{ url: "https://careers.acme.example/team", title: "Team - Acme Analytics" }],
            citations: [],
            pages: [{ url: "https://careers.acme.example/team", title: "Our team - Acme Analytics", text: "Jane Smith, Talent Acquisition Partner at Acme Analytics, Ottawa, hires Senior Data Engineer roles." }],
          },
          raw: [
            { name: "Jane Smith", location: "Ottawa", sourceUrls: ["https://careers.acme.example/team"] },
            { name: "Robert Invented", title: "Recruiter", sourceUrls: ["https://careers.acme.example/team"] },
          ],
        }),
      );
    });
    const res = await call(job, nextIp());
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const all = await lines(res);
    expect(all.filter((l) => l.type === "progress").map((l) => (l as { message: string }).message)).toEqual(expect.arrayContaining(["Searching: acme recruiter", "Reading careers.acme.example"]));
    const r = (all.find((l) => l.type === "result") as { type: "result"; result: FindRecruiterResponse }).result;
    expect(r.candidates.map((c) => c.name)).toEqual(["Jane Smith"]);
    expect(r.candidates[0]).toMatchObject({ status: "Verified", location: "Ottawa" });
    expect(r.candidates[0].jobs[0].jobSpecific).toBe(true);
    expect(r.queries).toEqual(["acme recruiter", "acme talent acquisition"]);
    expect(r.readHosts).toEqual(["careers.acme.example"]);
    expect(r.usage).toEqual(usage);
    expect(r.unsupported).toBe(1);
    expect(r.reasons?.[0]).toMatch(/No source/);
    expect(r.note).toMatch(/1 suggested name was left out/);
    expect(typeof r.latencyMs).toBe("number");
  });

  it("passes what is needed for a follow-up search, and works out nothing it was not given", async () => {
    search.searchWeb.mockResolvedValue(ok(okParsed()));
    await (await call({ ...job, exclude: ["Jane Smith"], pass: 2, category: "Data and analytics", description: "Pipelines" }, nextIp())).text();
    expect(search.searchWeb.mock.calls[0][0]).toMatchObject({ company: "Acme Analytics", exclude: ["Jane Smith"], pass: 2, category: "Data and analytics" });
  });

  it("says no reliable contact was found when the pages name nobody", async () => {
    search.searchWeb.mockResolvedValue(ok(okParsed({ searches: 4 })));
    const r = await resultOf(await call(job, nextIp()));
    expect(r.candidates).toEqual([]);
    expect(r.note).toMatch(/No page that was found names a recruiter/);
  });

  it("does not show names the search made up when no page backs any of them", async () => {
    search.searchWeb.mockResolvedValue(ok(okParsed({ searches: 1, evidence: { results: [{ url: "https://a.example", title: "A" }], citations: [], pages: [] }, raw: [{ name: "Made Up", sourceUrls: ["https://a.example"] }] })));
    const r = await resultOf(await call(job, nextIp()));
    expect(r.candidates).toEqual([]);
    expect(r.note).toMatch(/no page backed them up/i);
  });

  it("reports a search failure and a web search outage as errors, not as an empty result", async () => {
    search.searchWeb.mockResolvedValue({ ok: false, message: "The search took too long or could not connect. Nothing was saved. Try again." });
    const failed = (await lines(await call(job, nextIp()))).pop() as { type: string; error: string };
    expect(failed).toMatchObject({ type: "error" });
    expect(failed.error).toMatch(/took too long/);

    search.searchWeb.mockResolvedValue(ok(okParsed({ searches: 1, toolErrors: ["too_many_requests"] })));
    const outage = (await lines(await call(job, nextIp()))).pop() as { type: string; error: string };
    expect(outage.type).toBe("error");
    expect(outage.error).toMatch(/rate limited/i);

    search.searchWeb.mockRejectedValue(new Error("boom"));
    expect(((await lines(await call(job, nextIp()))).pop() as { type: string }).type).toBe("error");
  });

  it("limits how often one visitor can run a lookup", async () => {
    search.searchWeb.mockResolvedValue(ok(okParsed()));
    const ip = nextIp();
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await call(job, ip);
      statuses.push(res.status);
      await res.text();
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});
