import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEARCH_FEE_USD, parseLookup, percentile, summarize, validateJobs } from "../scripts/eval-lib.mjs";
import { verifyCandidates, type JobContext, type WebEvidence } from "@/lib/contacts/verify";

/**
 * Everything in this file is SYNTHETIC: invented companies and invented people on invented pages. It tests that the
 * measuring and the checking behave correctly across different kinds of job. It says nothing about how well real web
 * search finds real recruiters: that is measured on real postings with scripts/eval-recruiters.mjs.
 */

const cand = (name: string, status: string, over: object = {}) => ({ name, company: "Fictional Co", status, sources: [{ url: "https://fictional.example/team", evidence: `${name} at Fictional Co` }], ...over });
const ok = (industry: string, candidates: object[], over: object = {}) => ({ industry, company: "Fictional Co", title: "T", ok: true, latencyMs: 1000, candidates, usage: { searches: 4, fetches: 2, inputTokens: 1000, outputTokens: 200 }, ...over });

describe("measuring discovery", () => {
  const results = [
    ok("Technology", [cand("Ada Lovelace", "Verified"), cand("Alan Turing", "Possible match")], { latencyMs: 2000 }),
    ok("Finance", [cand("Grace Hopper", "Likely match")], { latencyMs: 4000 }),
    ok("Healthcare", [cand("Mary Seacole", "Possible match")], { latencyMs: 6000 }),
    ok("Government", [], { latencyMs: 8000 }),
    { industry: "Consulting", company: "Fictional Co", title: "T", ok: false, error: "The search took too long", candidates: [] },
  ];
  const s = summarize(results);

  it("counts hit rates over the searches that ran, in three strengths", () => {
    expect(s.searches).toBe(5);
    expect(s.hitRate).toEqual({ anyContact: 75, relevantContact: 50, highConfidence: 25 });
  });
  it("counts failures separately and keeps their messages", () => {
    expect(s.failures).toEqual({ count: 1, rate: 20, messages: ["The search took too long"] });
  });
  it("reports how many contacts carry a source with evidence, and the mix by confidence", () => {
    expect(s.contacts).toMatchObject({ total: 4, withVerifiableSource: 4, verifiableRate: 100, byStatus: { Verified: 1, "Likely match": 1, "Possible match": 2 } });
    const unsourced = summarize([ok("Technology", [cand("A B", "Verified", { sources: [] }), cand("C D", "Verified")])]);
    expect(unsourced.contacts.verifiableRate).toBe(50);
  });
  it("measures duplicates within one search only", () => {
    const dupes = summarize([ok("Technology", [cand("Jane Smith", "Verified"), cand("jane  smith", "Likely match"), cand("Omar Ali", "Verified")]), ok("Finance", [cand("Jane Smith", "Verified")])]);
    expect(dupes.duplicateRate).toBe(25);
  });
  it("gives latency percentiles over the searches that ran", () => {
    expect(s.latencyMs).toMatchObject({ mean: 5000, p50: 6000, max: 8000 });
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
    expect(percentile([], 50)).toBeNull();
  });
  it("prices search fees at the documented rate and only adds token cost when given token prices", () => {
    expect(SEARCH_FEE_USD).toBe(0.01);
    expect(s.usage).toMatchObject({ searches: 16, fetches: 8 });
    expect(s.cost.searchFeesUsd).toBe(0.16);
    expect(s.cost.tokenCostUsd).toBeNull();
    expect(s.cost.totalUsd).toBeNull();
    expect(s.cost.note).toMatch(/Token cost not included/);
    const priced = summarize(results, { inPerMTok: 3, outPerMTok: 15 });
    // 4 searches ran: 4000 input and 800 output tokens, at $3 and $15 per million.
    expect(priced.cost.tokenCostUsd).toBe(0.024);
    expect(priced.cost.totalUsd).toBe(0.184);
    expect(priced.cost.perSearchUsd).toBe(0.046);
  });
  it("breaks results down by industry and says whether coverage is enough", () => {
    expect(s.byIndustry.Technology).toEqual({ searches: 1, withRelevant: 1, failed: 0 });
    expect(s.byIndustry.Consulting).toEqual({ searches: 1, withRelevant: 0, failed: 1 });
    expect(s.coverage).toEqual({ industries: 5, enoughJobs: false });
  });
  it("never invents a figure from nothing", () => {
    const none = summarize([]);
    expect(none.hitRate.anyContact).toBeNull();
    expect(none.latencyMs.mean).toBeNull();
    expect(none.contacts.verifiableRate).toBeNull();
  });
});

describe("reading a lookup's answer", () => {
  const line = (o: object) => JSON.stringify(o);
  it("reads the result line, ignoring progress, and keeps only what is measured", () => {
    const text = [line({ type: "progress", message: "Searching" }), line({ type: "result", result: { note: null, latencyMs: 4200, usage: { searches: 3, fetches: 1, inputTokens: 1, outputTokens: 1 }, candidates: [{ name: "Ada Lovelace", company: "Fictional Co", status: "Verified", email: "x@y.z", sources: [{ url: "https://a.example", evidence: "e", type: "company site" }] }] } })].join("\n");
    const r = parseLookup(text);
    expect(r).toMatchObject({ ok: true, latencyMs: 4200 });
    expect(r.candidates[0]).toEqual({ name: "Ada Lovelace", company: "Fictional Co", status: "Verified", sources: [{ url: "https://a.example", evidence: "e" }] });
  });
  it("reports an error line, an empty answer and broken lines as failures", () => {
    expect(parseLookup(line({ type: "error", error: "The Anthropic rate limit was reached." }))).toEqual({ ok: false, error: "The Anthropic rate limit was reached." });
    expect(parseLookup("").ok).toBe(false);
    expect(parseLookup("not json\n{broken").ok).toBe(false);
  });
});

describe("refusing to spend money by accident", () => {
  it("rejects the template, which still holds placeholders", () => {
    const template = JSON.parse(readFileSync(join(process.cwd(), "scripts", "eval-jobs.example.json"), "utf8"));
    expect(template).toHaveLength(10);
    expect(new Set(template.map((j: { industry: string }) => j.industry)).size).toBeGreaterThanOrEqual(6);
    expect(validateJobs(template).length).toBeGreaterThan(0);
  });
  it("accepts real-looking jobs and rejects an empty list or a missing field", () => {
    expect(validateJobs([{ title: "Data Engineer", company: "Some Employer" }])).toEqual([]);
    expect(validateJobs([])).toHaveLength(1);
    expect(validateJobs([{ title: "", company: "X" }])[0]).toMatch(/title is missing/);
  });
});

/* ---------- the checking, across kinds of job ---------- */

describe("the checking holds across kinds of job (synthetic evidence)", () => {
  const now = new Date(2026, 10, 22, 12);
  const cases: { industry: string; title: string; company: string; location: string; page: string; claims: { name: string; title?: string; location?: string }[]; expectNames: string[]; expectHigh?: string[] }[] = [
    { industry: "Technology", title: "Senior Software Developer", company: "Quillworks Software", location: "Ottawa, ON", page: "Priya Rao, Technical Recruiter at Quillworks Software, Ottawa, recruits Senior Software Developer roles.", claims: [{ name: "Priya Rao", location: "Ottawa" }], expectNames: ["Priya Rao"], expectHigh: ["Priya Rao"] },
    { industry: "Data engineering", title: "Data Engineer", company: "Tessera Analytics", location: "Toronto, ON", page: "Marcus Bell, Talent Acquisition Partner for Data at Tessera Analytics.", claims: [{ name: "Marcus Bell" }], expectNames: ["Marcus Bell"] },
    { industry: "Finance", title: "Financial Analyst", company: "Northgate Capital", location: "Toronto, ON", page: "Lena Fischer, Recruiter, Finance, Northgate Capital. Lena hires Financial Analyst roles.", claims: [{ name: "Lena Fischer" }], expectNames: ["Lena Fischer"], expectHigh: ["Lena Fischer"] },
    { industry: "Healthcare", title: "Registered Nurse", company: "Harborview Health", location: "Ottawa, ON", page: "Tomas Reyes, HR Manager at Harborview Health.", claims: [{ name: "Tomas Reyes" }], expectNames: ["Tomas Reyes"] },
    { industry: "Government", title: "Policy Advisor", company: "Ministry of Fictional Affairs", location: "Ottawa, ON", page: "Nadia Haddad, HR Business Partner, Ministry of Fictional Affairs.", claims: [{ name: "Nadia Haddad" }], expectNames: ["Nadia Haddad"] },
    { industry: "Consulting", title: "Management Consultant", company: "Brightpath Advisory", location: "Toronto, ON", page: "Owen Price, former Talent Acquisition Partner at Brightpath Advisory, left in 2023.", claims: [{ name: "Owen Price" }], expectNames: ["Owen Price"] },
    { industry: "Technology", title: "DevOps Engineer", company: "Cobalt Systems", location: "Remote - Canada", page: "Rosa Lindgren is a Recruiter at Westfield Group.", claims: [{ name: "Rosa Lindgren" }], expectNames: [] },
    { industry: "Data engineering", title: "BI Developer", company: "Marlow Insights", location: "Ottawa, ON", page: "The Marlow Insights team page lists no recruiting staff.", claims: [{ name: "Invented Person", title: "Recruiter" }], expectNames: [] },
  ];

  const results = cases.map((c) => {
    const url = `https://${c.company.toLowerCase().replace(/[^a-z]/g, "")}.example/team`;
    const ev: WebEvidence = { results: [{ url, title: `Team - ${c.company}` }], citations: [], pages: [{ url, title: `Team - ${c.company}`, text: c.page }] };
    const ctx: JobContext = { jobKey: `${c.title}|${c.company}`.toLowerCase(), jobTitle: c.title, company: c.company, applyUrl: null, location: c.location };
    const { contacts } = verifyCandidates(c.claims.map((x) => ({ ...x, sourceUrls: [url] })), ev, ctx, now);
    return { c, contacts };
  });

  it("returns exactly the people a page supports, and none that no page supports or that work elsewhere", () => {
    for (const { c, contacts } of results) expect(contacts.map((x) => x.name), c.industry + " " + c.title).toEqual(c.expectNames);
  });
  it("gives every contact at least one source with evidence, and never marks a possible match high", () => {
    for (const { contacts } of results) for (const x of contacts) {
      expect(x.sources.length).toBeGreaterThan(0);
      expect(x.sources.every((s) => s.url && s.evidence)).toBe(true);
    }
    const former = results.find((r) => r.c.industry === "Consulting")!.contacts[0];
    expect(former.status).toBe("Possible match");
  });
  it("is high confidence only when a source ties the person to this posting", () => {
    for (const { c, contacts } of results) {
      for (const x of contacts) expect(x.status === "Verified").toBe((c.expectHigh ?? []).includes(x.name));
    }
  });
  it("summarises as expected: hit rate, sourced contacts and no duplicates, over six kinds of industry", () => {
    const summary = summarize(
      results.map(({ c, contacts }) => ({ industry: c.industry, company: c.company, title: c.title, ok: true, latencyMs: 0, candidates: contacts.map((x) => ({ name: x.name, company: x.company, status: x.status, sources: x.sources.map((s) => ({ url: s.url, evidence: s.evidence })) })) })),
    );
    expect(summary.hitRate.anyContact).toBe(75);
    expect(summary.contacts.verifiableRate).toBe(100);
    expect(summary.duplicateRate).toBe(0);
    expect(summary.coverage.industries).toBe(6);
  });
});
