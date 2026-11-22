import { describe, expect, it } from "vitest";
import { EMPTY_INTEL, HISTORY_MAX, SEEN_MAX, recordSearch, statedPay } from "@/lib/history";
import { readIntel } from "@/lib/history-load";
import { MIN_FOR_RATE, computeIntelligence, placeOf } from "@/lib/intelligence";
import { createApplication, moveApplication } from "@/lib/applications";
import { DEFAULT_FILTERS, type IntelStore, type Job } from "@/types/job";
import { makeJob } from "./helpers";

const at = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString();
const now = new Date(2026, 10, 22, 12);
const scored = (over: Partial<Job>, score: number): Job =>
  makeJob({ ...over, match: { score, matchingSkills: [], missingSkills: [], matchReason: "", source: "heuristic" } });
const search = (store: IntelStore, jobs: Job[], when = at(20), provider: "adzuna" | "demo" | "none" = "adzuna") =>
  recordSearch(store, { at: when, filters: DEFAULT_FILTERS, response: { jobs, provider, scoring: "heuristic" }, resume: { name: "Main" } });
const view = (store: IntelStore, over = {}) => computeIntelligence({ history: store.history, seen: store.seen, applications: [], profileSkills: ["Python", "SQL"], roles: [], now, ...over });

describe("recording searches", () => {
  it("notes each job once, even when a search lists it twice or a later search finds it again", () => {
    const a = makeJob({ id: "a" });
    let s = search(EMPTY_INTEL, [a, { ...a, id: "a2" }]);
    expect(s.seen).toHaveLength(1);
    expect(s.history[0].resultCount).toBe(1);
    expect(s.history[0].newCount).toBe(1);
    s = search(s, [a, makeJob({ id: "b", title: "Data Analyst" })], at(21));
    expect(s.seen).toHaveLength(2);
    expect(s.history[0].newCount).toBe(1);
    const first = s.seen.find((j) => j.title === "Data Engineer")!;
    expect(first.seenCount).toBe(2);
    expect(first.firstSeenAt).toBe(at(20));
    expect(first.lastSeenAt).toBe(at(21));
  });

  it("records nothing when no job source is configured, since nothing was observed", () => {
    expect(search(EMPTY_INTEL, [], at(20), "none")).toBe(EMPTY_INTEL);
  });

  it("still records a real search that found nothing", () => {
    const s = search(EMPTY_INTEL, []);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].avgScore).toBeNull();
  });

  it("averages only the scored results", () => {
    const s = search(EMPTY_INTEL, [scored({ id: "a" }, 80), scored({ id: "b", title: "BI Developer" }, 60), makeJob({ id: "c", title: "Cook" })]);
    expect(s.history[0]).toMatchObject({ avgScore: 70, scoredCount: 2, resultCount: 3 });
  });

  it("reads skills from the posting when it is seen and does not keep the description", () => {
    const s = search(EMPTY_INTEL, [makeJob({ description: "Requirements:\nPython and SQL\nNice to have:\nAirflow" })]);
    expect(s.seen[0].required).toEqual(expect.arrayContaining(["Python", "SQL"]));
    expect(JSON.stringify(s.seen[0])).not.toContain("Nice to have");
  });

  it("keeps the newest entries when the limits are reached", () => {
    let s = EMPTY_INTEL;
    for (let i = 0; i < HISTORY_MAX + 5; i++) s = search(s, [], new Date(2026, 0, 1, 0, i).toISOString());
    expect(s.history).toHaveLength(HISTORY_MAX);
    const many = Array.from({ length: SEEN_MAX + 20 }, (_, i) => makeJob({ id: `j${i}`, title: `Role ${i}`, company: `Co ${i}` }));
    expect(search(EMPTY_INTEL, many).seen).toHaveLength(SEEN_MAX);
  });
});

describe("stated pay", () => {
  const pay = (over: object) => statedPay({ salary: { min: 100_000, max: 120_000, currency: "CAD", period: "year", estimated: false, ...over } });
  it("counts only pay the employer stated, in CAD", () => {
    expect(pay({})).toEqual({ lo: 100_000, hi: 120_000 });
    expect(pay({ estimated: true })).toBeNull();
    expect(pay({ currency: "USD" })).toBeNull();
    expect(statedPay({ salary: null })).toBeNull();
  });
  it("turns hourly pay into a year and drops figures that are clearly typos", () => {
    expect(pay({ min: 50, max: 60, period: "hour" })).toEqual({ lo: 104_000, hi: 124_800 });
    expect(pay({ min: 5, max: 9 })).toBeNull();
    expect(pay({ min: 100_000, max: 9_000_000 })).toBeNull();
  });
});

describe("reading stored history", () => {
  it("keeps readable entries and returns the damaged ones", () => {
    const s = search(EMPTY_INTEL, [makeJob({ id: "a" })]);
    const r = readIntel({ history: [...s.history, { nope: 1 }], seen: [...s.seen, s.seen[0], { key: 5 }] })!;
    expect(r.store.history).toHaveLength(1);
    expect(r.store.seen).toHaveLength(1);
    expect(r.rejected).toHaveLength(3);
  });
  it("rejects something that is not a store at all", () => {
    expect(readIntel([])).toBeUndefined();
    expect(readIntel({ history: 1, seen: [] })).toBeUndefined();
  });
});

describe("places", () => {
  it("groups the same place and the towns of the GTA", () => {
    expect(placeOf("Ottawa, ON")).toBe("Ottawa");
    expect(placeOf("Kanata, ON")).toBe("Ottawa");
    expect(placeOf("Mississauga, ON")).toBe("Greater Toronto Area");
    expect(placeOf("Toronto, ON")).toBe("Greater Toronto Area");
    expect(placeOf("Remote - Canada")).toBe("Remote");
    expect(placeOf("Canada")).toBe("Canada (no city)");
  });
});

describe("the numbers", () => {
  const jobs = [
    scored({ id: "1", title: "Data Engineer", company: "Acme", location: "Ottawa, ON", workMode: "Remote", description: "Requirements:\nPython, SQL and Spark" }, 85),
    scored({ id: "2", title: "Data Engineer", company: "Acme", location: "Toronto, ON", workMode: "Hybrid", description: "Requirements:\nPython and Kafka", salary: null }, 65),
    scored({ id: "3", title: "Senior .NET Developer", company: "Beta", location: "Ottawa, ON", workMode: "On-site", description: "Requirements:\nC# and .NET" }, 40),
    makeJob({ id: "4", title: "Cook", company: "Gamma", location: "Ottawa, ON", salary: { min: 20, max: 22, currency: "CAD", period: "hour", estimated: true } }),
  ];
  const store = search(EMPTY_INTEL, jobs);

  it("counts what was seen, by place, arrangement and stated pay", () => {
    const v = view(store);
    expect(v.jobs).toBe(4);
    expect(v.locations[0]).toEqual({ label: "Ottawa", value: 3 });
    expect(v.arrangement.find((a) => a.label === "Remote")?.value).toBe(1);
    // The estimated hourly figure is not counted, and the job with no pay is not put in a band.
    expect(v.salaryStated).toBe(2);
    expect(v.salaryBands.find((b) => b.label === "$120k to $140k")?.value).toBe(2);
  });

  it("averages only scored jobs", () => {
    expect(view(store).averageScore).toBe(63.3);
  });

  it("puts the first sighting on the day it happened, with zeros on the other days", () => {
    const v = view(store);
    expect(v.discoveredByDay).toHaveLength(30);
    expect(v.discoveredByDay.find((d) => d.day === "2026-11-20")?.value).toBe(4);
    expect(v.discoveredByDay.reduce((n, d) => n + d.value, 0)).toBe(4);
    expect(v.scoreByDay.find((d) => d.day === "2026-11-20")?.value).toBe(63.3);
    expect(v.scoreByDay.find((d) => d.day === "2026-11-19")?.value).toBeNull();
  });

  it("ranks skills by how many postings ask, flags the ones you have, and lists the gaps", () => {
    const v = view(store);
    const python = v.skills.find((s) => s.skill === "Python")!;
    expect(python).toMatchObject({ jobs: 3, have: true });
    expect(v.gaps.map((g) => g.skill)).toEqual(expect.arrayContaining(["Apache Spark", "Kafka"]));
    expect(v.gaps.some((g) => g.skill === "Python")).toBe(false);
  });

  it("lists companies only from relevant jobs", () => {
    const v = view(store);
    expect(v.companies).toEqual([{ company: "Acme", jobs: 2, best: 85 }]);
  });

  it("compares roles by what was actually seen", () => {
    const v = view(store, { roles: ["Data Engineer", "Senior .NET Developer", "Cloud Engineer"] });
    const de = v.roles.find((r) => r.role === "Data Engineer")!;
    expect(de).toMatchObject({ jobs: 2, suitable: 1, avgScore: 75, medianPay: 120_000, flexibleShare: 100 });
    expect(de.topMissing).toBe("Apache Spark");
    const net = v.roles.find((r) => r.role === "Senior .NET Developer")!;
    expect(net).toMatchObject({ jobs: 1, suitable: 0, flexibleShare: 0 });
    expect(v.roles.find((r) => r.role === "Cloud Engineer")).toMatchObject({ jobs: 0, avgScore: null, medianPay: null, flexibleShare: null });
  });

  it("leaves demo jobs out unless asked, and says how many there were", () => {
    const withDemo = recordSearch(store, { at: at(21), filters: DEFAULT_FILTERS, response: { jobs: [makeJob({ id: "d", title: "Invented", source: "demo" })], provider: "demo", scoring: "none" }, resume: null });
    expect(view(withDemo).jobs).toBe(4);
    expect(view(withDemo).demoObserved).toBe(1);
    expect(view(withDemo, { includeDemo: true }).jobs).toBe(5);
  });

  it("reports an empty history without inventing anything", () => {
    const v = view(EMPTY_INTEL);
    expect(v).toMatchObject({ jobs: 0, searches: 0, averageScore: null, firstSeen: null, hasScores: false, companies: [], skills: [] });
    expect(v.discoveredByDay.every((d) => d.value === 0)).toBe(true);
  });
});

describe("the application funnel", () => {
  const nowD = new Date(2026, 10, 22, 12);
  const mk = (id: string, status: Parameters<typeof createApplication>[1]) => createApplication(makeJob({ id, company: `Co ${id}` }), status, nowD);

  it("shows counts, not a rate, until enough applications went out", () => {
    const apps = [mk("1", "Applied"), mk("2", "Interview"), mk("3", "Interested")];
    const f = view(EMPTY_INTEL, { applications: apps }).funnel;
    expect(f).toMatchObject({ tracked: 3, sent: 2, interviewed: 1, offers: 0, enough: false, rate: null });
  });

  it("gives the rate once there is enough, counting interviews and offers once each", () => {
    const apps = [mk("1", "Applied"), mk("2", "Applied"), mk("3", "Rejected"), mk("4", "Interview"), moveApplication(mk("5", "Interview"), "Offer", nowD), mk("6", "Interested")];
    const f = view(EMPTY_INTEL, { applications: apps }).funnel;
    expect(f.sent).toBe(5);
    expect(f.sent).toBeGreaterThanOrEqual(MIN_FOR_RATE);
    expect(f).toMatchObject({ interviewed: 2, offers: 1, enough: true, rate: 40 });
  });

  it("counts every status, including ones with none", () => {
    const v = view(EMPTY_INTEL, { applications: [mk("1", "Applied")] });
    expect(v.applicationsByStatus.find((s) => s.label === "Applied")?.value).toBe(1);
    expect(v.applicationsByStatus.find((s) => s.label === "Offer")?.value).toBe(0);
    expect(v.applicationsByStatus).toHaveLength(9);
  });
});

describe("history in backups", () => {
  it("merges two stores without duplicating searches or jobs, keeping the earliest first sighting", async () => {
    const { mergeIntel } = await import("@/lib/history");
    const a = search(EMPTY_INTEL, [makeJob({ id: "a" })], at(10));
    const b = search(a, [makeJob({ id: "a" }), makeJob({ id: "b", title: "BI Developer" })], at(12));
    const m = mergeIntel(a, b);
    expect(m.history).toHaveLength(2);
    expect(m.seen).toHaveLength(2);
    const first = m.seen.find((j) => j.title === "Data Engineer")!;
    expect(first.firstSeenAt).toBe(at(10));
    expect(first.lastSeenAt).toBe(at(12));
    expect(mergeIntel(m, m)).toEqual(m);
  });

  it("round-trips through a backup, and a backup without history still loads", async () => {
    const { buildBackup, parseBackup } = await import("@/lib/backup");
    const { DEFAULT_PREFERENCES } = await import("@/types/job");
    const intel = search(EMPTY_INTEL, [scored({ id: "a" }, 80)]);
    const data = { resumes: [], activeResumeId: null, filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved: [] };
    const withIntel = parseBackup(buildBackup({ ...data, intel }));
    expect(withIntel.ok && withIntel.data.intel?.seen).toHaveLength(1);
    const without = parseBackup(buildBackup(data));
    expect(without.ok && without.data.intel).toBeUndefined();
  });
});
