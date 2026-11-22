import { beforeEach, describe, expect, it, vi } from "vitest";

type Params = { tools: { name: string; max_uses: number; blocked_domains?: string[]; max_content_tokens?: number }[] };
type Round = { blocks: object[]; stop: "pause_turn" | "end_turn"; usage: { searches: number; fetches: number }; hang?: boolean };

const fake = vi.hoisted(() => ({ rounds: [] as unknown[], calls: [] as unknown[] }));

vi.mock("@/lib/anthropic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/anthropic")>("@/lib/anthropic");
  return {
    ...actual,
    getSearchClient: () => ({
      messages: {
        stream: (params: Params, opts: { signal: AbortSignal }) => {
          fake.calls.push(params);
          const round = fake.rounds.shift() as Round;
          const handlers: ((b: object) => void)[] = [];
          return {
            on: (_event: string, cb: (b: object) => void) => void handlers.push(cb),
            finalMessage: () =>
              new Promise((resolve, reject) => {
                for (const b of round.blocks) for (const h of handlers) h(b);
                if (round.hang) opts.signal.addEventListener("abort", () => reject(new Error("aborted")));
                else resolve({ content: round.blocks, stop_reason: round.stop, usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: round.usage.searches, web_fetch_requests: round.usage.fetches } } });
              }),
          };
        },
      },
    }),
  };
});

import { BLOCKED_FETCH_DOMAINS, DEADLINE_MS, MAX_FETCHES, MAX_PAGE_TOKENS, MAX_SEARCHES, searchWeb } from "@/lib/contacts/web-search";

const input = { company: "Acme Analytics", jobTitle: "Data Engineer", category: "Data and analytics", description: "", location: "Ottawa, ON", applyHost: null };
const toolUse = (name: "web_search" | "web_fetch", detail: string) => ({ type: "server_tool_use", id: `x${Math.random()}`, name, input: name === "web_search" ? { query: detail } : { url: detail }, caller: { type: "direct" } });
const text = (t: string) => ({ type: "text", text: t, citations: null });

beforeEach(() => {
  fake.rounds = [];
  fake.calls = [];
});

describe("one lookup, however many times the API pauses it", () => {
  it("gives a continuation only the searches and page reads that are left", async () => {
    fake.rounds.push({ blocks: [toolUse("web_search", "a")], stop: "pause_turn", usage: { searches: 5, fetches: 2 } }, { blocks: [text("CANDIDATES\nNONE")], stop: "end_turn", usage: { searches: 3, fetches: 3 } });
    const r = await searchWeb(input);
    expect(r.ok).toBe(true);
    const calls = fake.calls as Params[];
    expect(calls).toHaveLength(2);
    expect(calls[0].tools.map((t) => t.max_uses)).toEqual([MAX_SEARCHES, MAX_FETCHES]);
    expect(calls[1].tools.map((t) => t.max_uses)).toEqual([MAX_SEARCHES - 5, MAX_FETCHES - 2]);
    if (r.ok) expect(r.usage).toMatchObject({ searches: 8, fetches: 5 });
  });

  it("stops, and says so, when the budget is spent and the API still wants to continue", async () => {
    fake.rounds.push({ blocks: [toolUse("web_search", "a")], stop: "pause_turn", usage: { searches: MAX_SEARCHES, fetches: 1 } });
    const r = await searchWeb(input);
    expect((fake.calls as Params[]).length).toBe(1);
    expect(r.ok && r.parsed.stoppedEarly).toBe(true);
  });

  it("never lets LinkedIn be fetched, and bounds the size of a page", async () => {
    fake.rounds.push({ blocks: [text("CANDIDATES\nNONE")], stop: "end_turn", usage: { searches: 1, fetches: 0 } });
    await searchWeb(input);
    const fetchTool = (fake.calls as Params[])[0].tools.find((t) => t.name === "web_fetch")!;
    expect(fetchTool.blocked_domains).toEqual(BLOCKED_FETCH_DOMAINS);
    expect(fetchTool.blocked_domains).toContain("linkedin.com");
    expect(fetchTool.max_content_tokens).toBe(MAX_PAGE_TOKENS);
    expect(MAX_PAGE_TOKENS).toBeLessThanOrEqual(6000);
  });

  it("uses what was already gathered when it is cancelled, instead of throwing it away", async () => {
    fake.rounds.push({ blocks: [toolUse("web_search", "acme recruiter"), toolUse("web_fetch", "https://careers.acme.example/team")], stop: "end_turn", usage: { searches: 1, fetches: 1 }, hang: true });
    const cancel = new AbortController();
    const progress: string[] = [];
    const pending = searchWeb(input, (m) => progress.push(m), cancel.signal);
    await new Promise((r) => setTimeout(r, 20));
    cancel.abort();
    const r = await pending;
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.stoppedEarly).toBe(true);
      expect(r.parsed.queries).toEqual(["acme recruiter"]);
      expect(r.usage).toMatchObject({ searches: 1, fetches: 1 });
    }
    expect(progress).toEqual(expect.arrayContaining(["Searching: acme recruiter", "Reading careers.acme.example"]));
  });

  it("stops at the overall deadline, not after each round has used its own time", async () => {
    vi.useFakeTimers();
    try {
      fake.rounds.push({ blocks: [toolUse("web_search", "slow")], stop: "end_turn", usage: { searches: 1, fetches: 0 }, hang: true });
      const pending = searchWeb(input);
      await vi.advanceTimersByTimeAsync(DEADLINE_MS + 10);
      const r = await pending;
      expect(DEADLINE_MS).toBeLessThanOrEqual(95_000);
      expect(r.ok && r.parsed.stoppedEarly).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a stop before anything was gathered as a plain message, not a crash", async () => {
    fake.rounds.push({ blocks: [], stop: "end_turn", usage: { searches: 0, fetches: 0 }, hang: true });
    const cancel = new AbortController();
    const pending = searchWeb(input, undefined, cancel.signal);
    await new Promise((r) => setTimeout(r, 10));
    cancel.abort();
    expect(await pending).toEqual({ ok: false, message: "The search was stopped before it found anything." });
  });
});
