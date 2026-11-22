import { describe, expect, it } from "vitest";
import { buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { hashData, isEmptyData, mergeAppData } from "@/lib/cloud/sync";
import { SUGGESTED_SITES, addSite, markChecked, mergeWatchlists, nextCheck, normalizeUrl, removeSite, updateSite, watchReminders } from "@/lib/watchlist/model";
import { readWatchlist } from "@/lib/watchlist/schema";
import { DEFAULT_FILTERS, DEFAULT_PREFERENCES } from "@/types/job";
import { EMPTY_WATCHLIST, type WatchlistStore } from "@/types/watchlist";

const now = new Date(2026, 10, 22, 12);
const add = (store: WatchlistStore, name: string, url: string, over: object = {}) => {
  const r = addSite(store, { name, url, ...over }, now);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("adding sites", () => {
  it("accepts a web address and records when it was added", () => {
    const r = add(EMPTY_WATCHLIST, "CMHC careers", "https://example.org/careers", { category: "Crown corporation", everyDays: 3 });
    expect(r.site).toMatchObject({ name: "CMHC careers", category: "Crown corporation", everyDays: 3, lastCheckedAt: null, checks: 0, origin: "manual" });
    expect(r.store.sites).toHaveLength(1);
  });
  it("refuses anything that is not a web address, an empty name, or a duplicate", () => {
    for (const url of ["javascript:alert(1)", "ftp://x.example", "not a url", "", "data:text/html,hi"]) {
      expect(addSite(EMPTY_WATCHLIST, { name: "X", url }, now).ok).toBe(false);
    }
    expect(addSite(EMPTY_WATCHLIST, { name: " ", url: "https://a.example" }, now)).toMatchObject({ ok: false });
    const first = add(EMPTY_WATCHLIST, "A", "https://www.example.org/careers/");
    const dupe = addSite(first.store, { name: "A again", url: "http://example.org/careers?x=1#top" }, now);
    expect(dupe).toEqual({ ok: false, error: "That address is already on your watchlist." });
    expect(normalizeUrl("https://www.Example.org/careers/")).toBe("example.org/careers");
  });
  it("cuts long text and falls back to safe values", () => {
    const r = add(EMPTY_WATCHLIST, "n".repeat(500), "https://a.example", { notes: "x".repeat(9000), everyDays: 5 });
    expect(r.site.name).toHaveLength(120);
    expect(r.site.notes).toHaveLength(2000);
    expect(r.site.everyDays).toBe(7);
  });
  it("only offers suggested sites whose addresses are web addresses, with no duplicates", () => {
    for (const s of SUGGESTED_SITES) expect(s.url).toMatch(/^https:\/\//);
    expect(new Set(SUGGESTED_SITES.map((s) => normalizeUrl(s.url))).size).toBe(SUGGESTED_SITES.length);
    expect(SUGGESTED_SITES.length).toBeGreaterThan(0);
  });
});

describe("when a check is due", () => {
  const base = add(EMPTY_WATCHLIST, "Never", "https://never.example", { everyDays: 7 }).store;
  it("a site never checked is due now, and says so", () => {
    const r = watchReminders(base.sites, now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ neverChecked: true, when: "Due today", overdue: false });
  });
  it("is due again after the chosen number of days, and not before", () => {
    const checked = markChecked(base, base.sites[0].id, now);
    expect(checked.sites[0]).toMatchObject({ lastCheckedAt: "2026-11-22", checks: 1 });
    expect(nextCheck(checked.sites[0], now)).toBe("2026-11-29");
    expect(watchReminders(checked.sites, now)).toEqual([]);
    expect(watchReminders(checked.sites, new Date(2026, 10, 28, 12))).toEqual([]);
    expect(watchReminders(checked.sites, new Date(2026, 10, 29, 12))[0].when).toBe("Due today");
    expect(watchReminders(checked.sites, new Date(2026, 11, 2, 12))[0]).toMatchObject({ overdue: true, when: "Overdue by 3 days" });
  });
  it("lists the most overdue first, and can include sites due soon", () => {
    let s = add(EMPTY_WATCHLIST, "Late", "https://late.example", { everyDays: 1 }).store;
    s = markChecked(s, s.sites[0].id, new Date(2026, 10, 10, 12));
    s = add(s, "Soon", "https://soon.example", { everyDays: 7 }).store;
    const soon = markChecked(s, s.sites.find((x) => x.name === "Soon")!.id, new Date(2026, 10, 16, 12));
    expect(watchReminders(soon.sites, now).map((r) => r.name)).toEqual(["Late"]);
    expect(watchReminders(soon.sites, now, 2).map((r) => r.name)).toEqual(["Late", "Soon"]);
  });
  it("ignores an impossible check date", () => {
    const s = add(EMPTY_WATCHLIST, "Odd", "https://odd.example").store;
    const bad = updateSite(s, s.sites[0].id, { lastCheckedAt: "0002-01-01" }, now);
    expect(bad.sites[0].lastCheckedAt).toBeNull();
  });
});

describe("removing and combining", () => {
  it("remembers a removal so another device cannot bring the site back", () => {
    const a = add(EMPTY_WATCHLIST, "A", "https://a.example");
    const removed = removeSite(a.store, a.site.id);
    expect(removed.sites).toEqual([]);
    expect(mergeWatchlists(removed, a.store).sites).toEqual([]);
    expect(mergeWatchlists(a.store, removed).sites).toEqual([]);
  });
  it("combines two devices: one site per address, the later check and the newer edits kept", () => {
    const a = add(EMPTY_WATCHLIST, "A", "https://a.example").store;
    const onB = markChecked(a, a.sites[0].id, new Date(2026, 10, 20, 12));
    const onA = updateSite(markChecked(a, a.sites[0].id, new Date(2026, 10, 18, 12)), a.sites[0].id, { notes: "newer note" }, new Date(2026, 10, 21, 12));
    const m = mergeWatchlists(onA, onB);
    expect(m.sites).toHaveLength(1);
    expect(m.sites[0].lastCheckedAt).toBe("2026-11-20");
    expect(m.sites[0].notes).toBe("newer note");
    const sameUrlOtherId = add(EMPTY_WATCHLIST, "A copy", "https://www.a.example/").store;
    expect(mergeWatchlists(a, sameUrlOtherId).sites).toHaveLength(1);
  });
});

describe("reading what was stored", () => {
  it("keeps readable sites, sets aside damaged ones and anything that is not a web address", () => {
    const good = add(EMPTY_WATCHLIST, "Good", "https://good.example").site;
    const r = readWatchlist({ sites: [good, { nope: 1 }, { ...good, id: "x2", url: "javascript:alert(1)" }, { ...good }], deletedIds: ["z", 4] })!;
    expect(r.store.sites).toHaveLength(1);
    expect(r.store.deletedIds).toEqual(["z"]);
    expect(r.rejected).toHaveLength(3);
    expect(readWatchlist([])).toBeUndefined();
    expect(readWatchlist({ sites: 1 })).toBeUndefined();
  });
});

describe("watchlist in backups and sync", () => {
  const data = (over: Partial<AppData> = {}): AppData => ({ resumes: [], activeResumeId: null, filters: DEFAULT_FILTERS, preferences: DEFAULT_PREFERENCES, saved: [], ...over });
  it("round-trips through a backup, and a damaged site does not reject the backup", () => {
    const a = add(EMPTY_WATCHLIST, "A", "https://a.example").store;
    const ok = parseBackup(buildBackup(data({ watchlist: a })));
    expect(ok.ok && ok.data.watchlist?.sites).toHaveLength(1);
    const damaged = { ...a, sites: [...a.sites, { broken: true }] } as unknown as WatchlistStore;
    const r = parseBackup(buildBackup(data({ watchlist: damaged })));
    expect(r.ok && r.data.watchlist?.sites).toHaveLength(1);
    const none = parseBackup(buildBackup(data()));
    expect(none.ok && none.data.watchlist).toBeUndefined();
  });
  it("counts the watchlist for emptiness and for change, and merges it", () => {
    const a = add(EMPTY_WATCHLIST, "A", "https://a.example").store;
    expect(isEmptyData(data())).toBe(true);
    expect(isEmptyData(data({ watchlist: a }))).toBe(false);
    expect(hashData(data({ watchlist: a }))).not.toBe(hashData(data()));
    const checked = markChecked(a, a.sites[0].id, now);
    expect(hashData(data({ watchlist: checked }))).not.toBe(hashData(data({ watchlist: a })));
    const merged = mergeAppData(data({ watchlist: a }), data({ watchlist: add(EMPTY_WATCHLIST, "B", "https://b.example").store }));
    expect(merged.watchlist?.sites.map((s) => s.name).sort()).toEqual(["A", "B"]);
  });
});
