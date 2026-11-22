import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages/messages";

const search = vi.hoisted(() => ({ searchWeb: vi.fn() }));
const auth = vi.hoisted(() => ({ requireSignedIn: vi.fn(), signInEnforced: vi.fn() }));

vi.mock("@/lib/contacts/web-search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contacts/web-search")>("@/lib/contacts/web-search");
  return { ...actual, searchWeb: search.searchWeb };
});
vi.mock("@/lib/cloud/auth", () => ({ requireSignedIn: auth.requireSignedIn, signInEnforced: auth.signInEnforced }));

import { POST } from "@/app/api/find-recruiter/route";
import { parseCandidatesBlock, parseResponse } from "@/lib/contacts/web-search";

const call = (body: unknown, ip = "1.1.1.1") =>
  POST(new Request("http://x/api/find-recruiter", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

const job = { jobKey: "senior data engineer|acme analytics|ottawa", title: "Senior Data Engineer", company: "Acme Analytics", location: "Ottawa, ON", applyUrl: "https://careers.acme.example/jobs/123", source: "adzuna" as const };

let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
  vi.stubEnv("RECRUITER_WEB_SEARCH", "1");
  auth.signInEnforced.mockReset().mockReturnValue(false);
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
    {
      type: "text",
      text: "Jane Smith is the Talent Acquisition Partner.\n",
      citations: [{ type: "web_search_result_location", url: "https://careers.acme.example/team", title: "Team", cited_text: "Jane Smith, Talent Acquisition Partner at Acme Analytics", encrypted_index: "i" }],
    },
    { type: "text", text: "CANDIDATES\nJane Smith | Talent Acquisition Partner | | https://www.linkedin.com/in/jane-smith-ta | | | https://careers.acme.example/team, https://www.linkedin.com/in/jane-smith-ta | Recruits for data roles", citations: null },
  ]);

  it("collects result addresses and titles, cited passages, the search count and the claimed candidates", () => {
    const p = parseResponse(content);
    expect(p.searches).toBe(1);
    expect(p.evidence.results.map((r) => r.url)).toEqual(["https://careers.acme.example/team", "https://www.linkedin.com/in/jane-smith-ta"]);
    expect(p.evidence.citations).toEqual([{ url: "https://careers.acme.example/team", citedText: "Jane Smith, Talent Acquisition Partner at Acme Analytics" }]);
    expect(p.raw).toHaveLength(1);
    expect(p.raw[0]).toMatchObject({ name: "Jane Smith", title: "Talent Acquisition Partner", note: "Recruits for data roles" });
    expect(p.raw[0].sourceUrls).toHaveLength(2);
    expect(p.raw[0].email).toBeUndefined();
  });

  it("reports a web search tool error instead of results", () => {
    const p = parseResponse(blocks([{ type: "web_search_tool_result", tool_use_id: "s1", caller: { type: "direct" }, content: { type: "web_search_tool_result_error", error_code: "unavailable" } }]));
    expect(p.toolErrors).toEqual(["unavailable"]);
    expect(p.evidence.results).toEqual([]);
  });

  it("reads NONE, a missing block and list markers", () => {
    expect(parseCandidatesBlock("Nothing found.\nCANDIDATES\nNONE")).toEqual([]);
    expect(parseCandidatesBlock("No block here")).toEqual([]);
    expect(parseCandidatesBlock("CANDIDATES\n- Jane Smith | Recruiter | | | | | https://a.example/x |")).toHaveLength(1);
    expect(parseCandidatesBlock("CANDIDATES\n\n  \njust text without pipes")).toEqual([]);
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
    // Once sign-in is enforced, that is the protection, and no separate opt-in is needed.
    auth.signInEnforced.mockReturnValue(true);
    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 0, toolErrors: [], evidence: { results: [], citations: [] }, raw: [] } });
    await call(job, nextIp());
    expect(search.searchWeb).toHaveBeenCalledTimes(1);
  });

  it("refusals do not use up the visitor lookup limit", async () => {
    const ip = nextIp();
    for (let i = 0; i < 6; i++) await call({ ...job, source: "demo" }, ip);
    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 0, toolErrors: [], evidence: { results: [], citations: [] }, raw: [] } });
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

  it("returns only people the sources back up, and says how many were left out", async () => {
    search.searchWeb.mockResolvedValue({
      ok: true,
      model: "m",
      parsed: {
        searches: 2,
        toolErrors: [],
        evidence: {
          results: [{ url: "https://careers.acme.example/team", title: "Team - Acme Analytics" }],
          citations: [{ url: "https://careers.acme.example/team", citedText: "Jane Smith, Talent Acquisition Partner at Acme Analytics, hires Senior Data Engineer roles." }],
        },
        raw: [
          { name: "Jane Smith", sourceUrls: ["https://careers.acme.example/team"] },
          { name: "Robert Invented", title: "Recruiter", sourceUrls: ["https://careers.acme.example/team"] },
        ],
      },
    });
    const body = await (await call(job, nextIp())).json();
    expect(body.candidates.map((c: { name: string }) => c.name)).toEqual(["Jane Smith"]);
    expect(body.candidates[0].status).toBe("Verified");
    expect(body.note).toMatch(/1 possible contact was left out/);
    expect(body.searches).toBe(2);
  });

  it("says no reliable contact was found when the search suggested nothing", async () => {
    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 1, toolErrors: [], evidence: { results: [], citations: [] }, raw: [] } });
    const body = await (await call(job, nextIp())).json();
    expect(body.candidates).toEqual([]);
    expect(body.note).toBe("No reliable contact was found for this job.");
  });

  it("does not show names the search made up when no page backs any of them", async () => {
    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 1, toolErrors: [], evidence: { results: [{ url: "https://a.example", title: "A" }], citations: [] }, raw: [{ name: "Made Up", sourceUrls: ["https://a.example"] }] } });
    const body = await (await call(job, nextIp())).json();
    expect(body.candidates).toEqual([]);
    expect(body.note).toMatch(/no page backed them up/i);
  });

  it("reports a search failure and a web search outage as errors, not as an empty result", async () => {
    search.searchWeb.mockResolvedValue({ ok: false, message: "The search took too long or could not connect. Nothing was saved. Try again." });
    const failed = await call(job, nextIp());
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toMatch(/took too long/);

    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 1, toolErrors: ["too_many_requests"], evidence: { results: [], citations: [] }, raw: [] } });
    const outage = await call(job, nextIp());
    expect(outage.status).toBe(502);
    expect((await outage.json()).error).toMatch(/rate limited/i);
  });

  it("limits how often one visitor can run a lookup", async () => {
    search.searchWeb.mockResolvedValue({ ok: true, model: "m", parsed: { searches: 0, toolErrors: [], evidence: { results: [], citations: [] }, raw: [] } });
    const ip = nextIp();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(job, ip)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});
