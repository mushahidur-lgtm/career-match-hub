import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBackup, type AppData } from "@/lib/backup";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES, type CandidateProfile, type IntelStore, type Job, type ResumeVersion } from "@/types/job";
import { DailyPayloadSchema, readDailyPayload, replayRun, type DailyPayload } from "@/lib/cloud/daily-payload";
import { handleDaily, secretMatches, type DailyDeps, type DailyStore } from "@/lib/cloud/daily-handler";
import { runDaily } from "@/lib/cloud/daily-run";
import { isDue, planQueries, torontoParts } from "@/lib/cloud/schedule";
import { NO_SYNC, hashData, isEmptyData, mergeAppData, planSync } from "@/lib/cloud/sync";
import { EMPTY_INTEL, recordSearch } from "@/lib/history";
import { makeJob, makeSaved } from "./helpers";

const SECRET = "a-long-enough-secret-value";
const profile: CandidateProfile = {
  summary: "Data engineer.",
  yearsOfExperience: 8,
  seniority: "Senior",
  skills: { languages: ["Python", "SQL"], frameworks: [], cloudData: ["Azure"], tools: [] },
  detectedRoles: [],
  recommendedRoles: [],
  source: "heuristic",
};
const resume = (id = "r1"): ResumeVersion => ({ id, name: "Main", text: "Built Python and SQL pipelines on Azure. ".repeat(5), fileName: null, uploadedAt: "2026-11-01T00:00:00Z", profile });
const data = (over: Partial<AppData> = {}): AppData => ({ resumes: [resume()], activeResumeId: "r1", filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved: [], ...over });

describe("the 8:00 AM Toronto window", () => {
  it("is 8:00 at 12:00 UTC in summer and at 13:00 UTC in winter", () => {
    expect(torontoParts(new Date("2026-07-15T12:00:00Z"))).toEqual({ date: "2026-07-15", hour: 8 });
    expect(torontoParts(new Date("2026-11-22T12:00:00Z"))).toEqual({ date: "2026-11-22", hour: 7 });
    expect(torontoParts(new Date("2026-11-22T13:00:00Z"))).toEqual({ date: "2026-11-22", hour: 8 });
  });
  it("uses the Toronto date, not the UTC one", () => {
    expect(torontoParts(new Date("2026-11-23T03:30:00Z")).date).toBe("2026-11-22");
  });
  it("is due from 8:00 on, once a day, even when GitHub starts late", () => {
    expect(isDue(new Date("2026-11-22T12:00:00Z"), false)).toBe(false);
    expect(isDue(new Date("2026-11-22T13:00:00Z"), false)).toBe(true);
    expect(isDue(new Date("2026-11-22T16:40:00Z"), false)).toBe(true);
    expect(isDue(new Date("2026-11-22T16:40:00Z"), true)).toBe(false);
    expect(isDue(new Date("2026-11-22T12:00:00Z"), true, true)).toBe(true);
  });
});

describe("planning the morning searches", () => {
  const prefs = { ...DEFAULT_PREFERENCES };
  it("caps the number of job-board calls and searches earlier cities first", () => {
    const q = planQueries(prefs, 12);
    expect(q).toHaveLength(12);
    expect(new Set(q.map((x) => x.location))).toEqual(new Set(prefs.locations.slice(0, 2)));
    expect(new Set(q.map((x) => x.query)).size).toBe(prefs.primaryRoles.length);
    expect(q.every((x) => x.employmentType === "Permanent full-time" && x.minSalary === prefs.minSalary)).toBe(true);
  });
  it("never exceeds the cap and gives nothing without roles or cities", () => {
    expect(planQueries(prefs, 3)).toHaveLength(3);
    expect(planQueries({ ...prefs, primaryRoles: [] }, 12)).toEqual([]);
    expect(planQueries({ ...prefs, locations: [" "] }, 12)).toEqual([]);
  });
});

/* ---------- the endpoint ---------- */

const payload: DailyPayload = { provider: "adzuna", resumeName: "Main", observations: [], searches: [], top: [], skipped: 0 };

function fakeStore(over: Partial<DailyStore> = {}) {
  const saved: { user: string; date: string; payload: DailyPayload }[] = [];
  const store: DailyStore = {
    findUsers: async () => [{ id: "u1" }],
    hasRun: async () => false,
    loadData: async () => data(),
    saveRun: async (user, date, p) => void saved.push({ user, date, payload: p }),
    pruneBefore: async () => undefined,
    ...over,
  };
  return { store, saved };
}
const deps = (over: Partial<DailyDeps> = {}): DailyDeps => ({
  secret: SECRET,
  emails: ["me@example.com"],
  store: fakeStore().store,
  run: async () => ({ ok: true, payload }),
  now: () => new Date("2026-11-22T14:00:00Z"),
  maxQueries: 12,
  budgetMs: 1000,
  ...over,
});
const call = (d: DailyDeps, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }, body?: unknown) =>
  handleDaily(new Request("http://x/api/cron/daily", { method: "POST", headers, body: body ? JSON.stringify(body) : undefined }), d);

describe("the daily endpoint refuses what it should", () => {
  it("rejects a missing, wrong or malformed secret", async () => {
    expect((await call(deps(), {})).status).toBe(401);
    expect((await call(deps(), { authorization: "Bearer nope" })).status).toBe(401);
    expect((await call(deps(), { authorization: SECRET })).status).toBe(401);
  });
  it("is closed, not open, when no secret is configured or it is too short", async () => {
    expect((await call(deps({ secret: undefined }), { authorization: "Bearer undefined" })).status).toBe(401);
    expect((await call(deps({ secret: "" }), { authorization: "Bearer " })).status).toBe(401);
    expect((await call(deps({ secret: "short" }), { authorization: "Bearer short" })).status).toBe(401);
    expect(secretMatches(SECRET, SECRET)).toBe(true);
  });
  it("does nothing, and says why, with no database or no allowed accounts", async () => {
    expect((await call(deps({ store: null }))).status).toBe(503);
    expect((await call(deps({ emails: [] }))).status).toBe(503);
  });
});

describe("the daily endpoint's work", () => {
  it("runs once, saves under the Toronto date, and does not run again that day", async () => {
    const f = fakeStore();
    let ran = 0;
    const d = deps({ store: f.store, run: async () => (ran++, { ok: true, payload }) });
    const res = await (await call(d)).json();
    expect(res.results[0].status).toBe("ran");
    expect(f.saved).toEqual([{ user: "u1", date: "2026-11-22", payload }]);

    const again = fakeStore({ hasRun: async () => true });
    const res2 = await (await call(deps({ store: again.store, run: async () => (ran++, { ok: true, payload }) }))).json();
    expect(res2.results[0]).toMatchObject({ status: "skipped", reason: "Already ran today." });
    expect(ran).toBe(1);
  });
  it("waits until 8:00 in Toronto, unless forced", async () => {
    const early = deps({ now: () => new Date("2026-11-22T12:00:00Z") });
    expect((await (await call(early)).json()).results[0].status).toBe("skipped");
    expect((await (await call(early, { authorization: `Bearer ${SECRET}` }, { force: true })).json()).results[0].status).toBe("ran");
  });
  it("says so when there is no synced data, and records nothing when no job source answered", async () => {
    const none = fakeStore({ loadData: async () => null });
    expect((await (await call(deps({ store: none.store }))).json()).results[0].reason).toMatch(/sync/i);
    const f = fakeStore();
    const res = await (await call(deps({ store: f.store, run: async () => ({ ok: false, reason: "No job source answered, so nothing was recorded." }) }))).json();
    expect(res.results[0].status).toBe("skipped");
    expect(f.saved).toHaveLength(0);
  });
  it("answers with an error, not a crash, when the database fails, and never returns an email", async () => {
    const broken = fakeStore({ findUsers: async () => { throw new Error("db down"); } });
    const r = await call(deps({ store: broken.store }));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("@");
  });
});

describe("running the searches", () => {
  const job = (id: string, title: string): Job => makeJob({ id, title, company: `Co ${id}`, description: "Requirements:\nPython and SQL on Azure" });
  const input = { resume: resume(), preferences: DEFAULT_PREFERENCES, maxQueries: 4, budgetMs: 10_000 };

  it("merges the same posting found by several searches, scores by rules, and keeps the best", async () => {
    const calls: string[] = [];
    const out = await runDaily(input, {
      search: async (f) => (calls.push(f.query), { jobs: [job("1", "Data Engineer"), job(`x${calls.length}`, `Role ${calls.length} Data`)], provider: "adzuna" as const, warnings: [] }),
      now: Date.now,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(calls).toHaveLength(4);
    expect(out.payload.searches).toHaveLength(4);
    // One shared posting plus four distinct ones.
    expect(out.payload.observations).toHaveLength(5);
    expect(out.payload.top.length).toBeGreaterThan(0);
    expect(out.payload.top.every((t) => t.score !== null)).toBe(true);
  });
  it("records nothing from sample data or a source that is not connected", async () => {
    const out = await runDaily(input, { search: async () => ({ jobs: [job("1", "Data Engineer")], provider: "demo" as const, warnings: [] }), now: Date.now });
    expect(out).toEqual({ ok: false, reason: "No job source answered, so nothing was recorded." });
    const none = await runDaily(input, { search: async () => ({ jobs: [], provider: "none" as const, warnings: [] }), now: Date.now });
    expect(none.ok).toBe(false);
  });
  it("survives one failed search and stops starting new ones when out of time", async () => {
    let n = 0;
    const ok = await runDaily(input, {
      search: async () => {
        if (n++ === 1) throw new Error("boom");
        return { jobs: [job(`j${n}`, `Data Engineer ${n}`)], provider: "adzuna" as const, warnings: [] };
      },
      now: Date.now,
    });
    expect(ok.ok && ok.payload.searches.length).toBe(3);
    expect(ok.ok && ok.payload.skipped).toBe(1);

    let t = 0;
    const late = await runDaily({ ...input, budgetMs: 5 }, { search: async () => ({ jobs: [job("1", "Data Engineer")], provider: "adzuna" as const, warnings: [] }), now: () => (t += 3) });
    expect(late.ok && late.payload.searches.length).toBe(1);
    expect(late.ok && late.payload.skipped).toBe(3);
  });
  it("still records what it saw, without scores, when there is no resume", async () => {
    const out = await runDaily({ ...input, resume: null }, { search: async () => ({ jobs: [job("1", "Data Engineer")], provider: "adzuna" as const, warnings: [] }), now: Date.now });
    expect(out.ok && out.payload.top).toEqual([]);
    expect(out.ok && out.payload.observations[0].score).toBeNull();
  });
});

describe("adding a morning run to the history", () => {
  const filters = DEFAULT_FILTERS;
  const obs = (key: string, score = 80) => ({ ...recordSearch(EMPTY_INTEL, { at: "2026-11-20T00:00:00Z", filters, response: { jobs: [makeJob({ id: key, title: key, company: key })], provider: "adzuna", scoring: "heuristic" }, resume: null }).seen[0], score });
  const strip = ({ firstSeenAt, lastSeenAt, seenCount, ...o }: ReturnType<typeof obs>) => (void firstSeenAt, void lastSeenAt, void seenCount, o);
  const p: DailyPayload = {
    provider: "adzuna",
    resumeName: "Main",
    observations: [strip(obs("a")), strip(obs("b"))],
    searches: [{ filters, keys: [obs("a").key, obs("b").key] }, { filters: { ...filters, query: "x" }, keys: [obs("a").key] }],
    top: [{ title: "a", company: "a", location: "Ottawa", score: 80, pay: null, postedAt: null, applyUrl: null }],
    skipped: 0,
  };
  const run = { id: "run-1", ran_at: "2026-11-22T13:05:00Z" };

  it("records each search at the time of the run, and counts new jobs once", () => {
    const s = replayRun(EMPTY_INTEL, run, p);
    expect(s.history).toHaveLength(2);
    expect(s.history.every((h) => h.at === run.ran_at)).toBe(true);
    expect(s.seen).toHaveLength(2);
    expect(s.history.map((h) => h.newCount).sort()).toEqual([0, 2]);
  });
  it("is idempotent: adding the same run twice changes nothing", () => {
    const once = replayRun(EMPTY_INTEL, run, p);
    expect(replayRun(once, run, p)).toEqual(once);
  });
  it("an older run added later does not move a job's latest sighting back", () => {
    const newer = replayRun(EMPTY_INTEL, { id: "run-2", ran_at: "2026-11-23T13:00:00Z" }, p);
    const both = replayRun(newer, run, p);
    const a = both.seen.find((j) => j.key === obs("a").key)!;
    expect(a.firstSeenAt).toBe(run.ran_at);
    expect(a.lastSeenAt).toBe("2026-11-23T13:00:00Z");
  });
  it("rejects a payload that is not the right shape", () => {
    expect(readDailyPayload({ nope: true })).toBeNull();
    expect(readDailyPayload(p)).not.toBeNull();
    expect(DailyPayloadSchema.safeParse({ ...p, provider: "demo" }).success).toBe(false);
  });
});

/* ---------- keeping two copies in step ---------- */

describe("deciding how to sync", () => {
  const mem = (lastVersion: number, lastHash: string | null) => ({ ...NO_SYNC, enabled: true, lastVersion, lastHash });
  it("sends first-time data, and does nothing for an empty browser with an empty cloud", () => {
    expect(planSync({ cloudVersion: null, memory: mem(0, null), localHash: "h", localEmpty: false })).toBe("push");
    expect(planSync({ cloudVersion: null, memory: mem(0, null), localHash: "h", localEmpty: true })).toBe("none");
  });
  it("takes the cloud copy into an empty browser, and merges when both have data on first sign-in", () => {
    expect(planSync({ cloudVersion: 3, memory: mem(0, null), localHash: "h", localEmpty: true })).toBe("pull");
    expect(planSync({ cloudVersion: 3, memory: mem(0, null), localHash: "h", localEmpty: false })).toBe("merge");
  });
  it("pushes only a local change, pulls only a cloud change, and merges when both changed", () => {
    expect(planSync({ cloudVersion: 4, memory: mem(4, "h1"), localHash: "h1", localEmpty: false })).toBe("none");
    expect(planSync({ cloudVersion: 4, memory: mem(4, "h1"), localHash: "h2", localEmpty: false })).toBe("push");
    expect(planSync({ cloudVersion: 5, memory: mem(4, "h1"), localHash: "h1", localEmpty: false })).toBe("pull");
    expect(planSync({ cloudVersion: 5, memory: mem(4, "h1"), localHash: "h2", localEmpty: false })).toBe("merge");
  });
  it("does not silently re-upload after the cloud copy was deleted", () => {
    expect(planSync({ cloudVersion: null, memory: mem(4, "h1"), localHash: "h2", localEmpty: false })).toBe("gone");
  });
});

describe("combining two copies", () => {
  const a1 = makeSaved(makeJob({ id: "a", title: "A", company: "A" }), { updatedAt: "2026-11-02T00:00:00Z" });
  const b1 = makeSaved(makeJob({ id: "b", title: "B", company: "B" }), { updatedAt: "2026-11-02T00:00:00Z" });
  const a2 = { ...a1, notes: "newer", updatedAt: "2026-11-05T00:00:00Z" };
  it("keeps what is on either side, and the newer copy of an application on both", () => {
    const m = mergeAppData(data({ saved: [a1] }), data({ saved: [a2, b1], resumes: [{ ...resume("r2"), text: "A different resume. ".repeat(5) }], activeResumeId: "r2" }));
    expect(m.saved.map((s) => s.job.id).sort()).toEqual(["a", "b"]);
    expect(m.saved.find((s) => s.job.id === "a")?.notes).toBe("newer");
    expect(m.resumes.map((r) => r.id).sort()).toEqual(["r1", "r2"].sort());
    expect(m.activeResumeId).toBe("r1");
  });
  it("merges history without duplicating", () => {
    const i: IntelStore = recordSearch(EMPTY_INTEL, { at: "2026-11-20T00:00:00Z", filters: DEFAULT_FILTERS, response: { jobs: [makeJob()], provider: "adzuna", scoring: "none" }, resume: null });
    const m = mergeAppData(data({ intel: i }), data({ intel: i }));
    expect(m.intel?.history).toHaveLength(1);
    expect(m.intel?.seen).toHaveLength(1);
  });
  it("tells empty data from data, and notices change but not time passing", () => {
    expect(isEmptyData(data({ resumes: [] }))).toBe(true);
    expect(isEmptyData(data())).toBe(false);
    expect(hashData(data())).toBe(hashData(data()));
    expect(hashData(data())).not.toBe(hashData(data({ saved: [a1] })));
    expect(buildBackup(data()).length).toBeGreaterThan(0);
  });
});

/* ---------- secrets ---------- */

describe("the server key stays on the server", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const src = files(join(process.cwd(), "src"));

  it("is read in one file only, which can never be bundled for the browser", () => {
    const users = src.filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(users.map((f) => f.replace(/\\/g, "/").split("/src/")[1])).toEqual(["lib/cloud/admin.ts"]);
    expect(readFileSync(users[0], "utf8")).toContain('import "server-only"');
  });
  it("is never given a NEXT_PUBLIC name", () => {
    for (const f of src) expect(readFileSync(f, "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/);
  });
  it("the cron secret is read only by the cron route", () => {
    const users = src.filter((f) => readFileSync(f, "utf8").includes("CRON_SECRET"));
    expect(users.map((f) => f.replace(/\\/g, "/").split("/src/")[1])).toEqual(["app/api/cron/daily/route.ts"]);
  });
});
