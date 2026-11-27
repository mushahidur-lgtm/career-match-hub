import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { ownerStore } from "@/lib/cloud/admin";
import { restoreContactDetails, withoutContactDetails } from "@/lib/cloud/redact";
import { forCloud } from "@/lib/cloud/sync";
import type { AppData } from "@/lib/backup";
import { DEFAULT_FILTERS } from "@/types/job";

// The real sign-in and limit code, with the database replaced at the network.
vi.unmock("@/lib/cloud/auth");
vi.unmock("@/lib/cloud/shared-limit");

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const TOKENS: Record<string, { id: string; is_anonymous?: boolean }> = {
  "owner.owner.sig": { id: OWNER },
  "other.other.sig": { id: STRANGER },
  "anon.anon.sig": { id: OWNER, is_anonymous: true },
};

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const API = join(SRC, "app", "api");
const routes = files(API)
  .filter((f) => f.endsWith(`${sep}route.ts`))
  .map((f) => relative(API, f).split(sep).slice(0, -1).join("/"))
  .sort();

type Handler = (req: Request) => Promise<Response>;
const load = (route: string) => import(/* @vite-ignore */ `../src/app/api/${route}/route.ts`) as Promise<Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>>;

/** The stand-in database: who each token is, and one request counter that every "instance" shares. */
let hits: Map<string, number>;
let limiter: "ok" | "broken";
let calls: string[];

let ip = 0;
const request = (route: string, token: string | null, body: unknown = {}, method = "POST") =>
  new Request(`http://localhost/api/${route}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.${(ip >> 8) & 255}.${++ip & 255}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-only-000000");
  vi.stubEnv("OWNER_USER_ID", OWNER);
};

beforeEach(() => {
  hits = new Map();
  limiter = "ok";
  calls = [];
  for (const name of ["SUPABASE_URL", "ANTHROPIC_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "RAPIDAPI_KEY", "CRON_SECRET", "CMH_DEMO"]) vi.stubEnv(name, "");
  configure();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/auth/v1/user") return TOKENS[token] ? json({ aud: "authenticated", ...TOKENS[token] }) : json({ message: "invalid token" }, 401);
    if (url.pathname === "/rest/v1/rpc/take_rate_limit") {
      if (limiter === "broken") return json({ message: "function does not exist" }, 404);
      const { p_bucket, p_max } = JSON.parse(String(init?.body)) as { p_bucket: string; p_max: number };
      const next = (hits.get(p_bucket) ?? 0) + 1;
      if (next > p_max) return json(false);
      hits.set(p_bucket, next);
      return json(true);
    }
    throw new Error(`unexpected outside request to ${url.host}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every route is private unless it is listed here with the reason. */
const OWN_SECRET = ["cron/daily"];

describe("every API route refuses visitors", () => {
  it("covers the routes this app has", () => {
    // A new route must pass the checks below; this list only makes a removed or added one visible in review.
    expect(routes).toEqual(["analyze-resume", "cron/daily", "find-recruiter", "interview-prep", "job-insights", "networking-draft", "search-jobs", "status"]);
  });

  it.each(routes)("%s answers 401 without a sign-in, and reads and calls nothing", async (route) => {
    const handlers = await load(route);
    const methods = (["GET", "POST", "PUT", "PATCH", "DELETE"] as const).filter((m) => handlers[m]);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      const req = request(route, null, { filters: DEFAULT_FILTERS }, method);
      const res = await handlers[method]!(req);
      expect(res.status, `${method} ${route}`).toBe(401);
      expect(req.bodyUsed).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  const privateRoutes = routes.filter((r) => !OWN_SECRET.includes(r));

  it.each(privateRoutes)("%s answers 401 to a made-up or expired token", async (route) => {
    const handlers = await load(route);
    const method = handlers.POST ? "POST" : "GET";
    for (const token of ["not-a-token", "forged.forged.sig"]) {
      expect((await handlers[method]!(request(route, token, {}, method))).status).toBe(401);
    }
  });

  it.each(privateRoutes)("%s refuses another account, and an anonymous session", async (route) => {
    const handlers = await load(route);
    const method = handlers.POST ? "POST" : "GET";
    for (const token of ["other.other.sig", "anon.anon.sig"]) {
      const req = request(route, token, {}, method);
      expect((await handlers[method]!(req)).status).toBe(403);
      expect(req.bodyUsed).toBe(false);
    }
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "OWNER_USER_ID"])("without %s every private route is closed, even to the owner", async (missing) => {
    for (const bad of ["", "nonsense"]) {
      vi.stubEnv(missing, bad);
      for (const route of privateRoutes) {
        const handlers = await load(route);
        const method = handlers.POST ? "POST" : "GET";
        const req = request(route, "owner.owner.sig", {}, method);
        expect((await handlers[method]!(req)).status, `${route} with ${missing}=${bad}`).toBe(503);
        expect(req.bodyUsed).toBe(false);
      }
    }
    expect(calls).toEqual([]);
  });

  it("the morning run needs its secret, and runs for nobody but the owner", async () => {
    const { POST } = await load("cron/daily");
    vi.stubEnv("CRON_SECRET", "a-long-secret-for-tests-only");
    expect((await POST!(request("cron/daily", "owner.owner.sig"))).status).toBe(401);
    const store = ownerStore({ findUsers: async () => [{ id: STRANGER }, { id: OWNER }], hasRun: async () => false, loadData: async () => ({ ok: false, reason: "missing" }), saveRun: async () => undefined, pruneBefore: async () => undefined }, OWNER);
    expect(await store.findUsers(["a@example.com"])).toEqual([{ id: OWNER }]);
  });
});

describe("the owner", () => {
  it("is let in", async () => {
    const { POST } = await load("search-jobs");
    const res = await POST!(request("search-jobs", "owner.owner.sig", { filters: DEFAULT_FILTERS, profile: null }));
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("unconfigured");
  });

  it("is still held to size limits", async () => {
    for (const [route, size] of [["search-jobs", 700_000], ["analyze-resume", 400_000], ["interview-prep", 700_000]] as const) {
      vi.stubEnv("ANTHROPIC_API_KEY", route === "interview-prep" ? "sk-test-not-real" : "");
      const { POST } = await load(route);
      expect((await POST!(request(route, "owner.owner.sig", `{"text":"${"x".repeat(size)}"}`))).status, route).toBe(413);
    }
  });

  it("shares one limit across server instances", async () => {
    const search = () => request("search-jobs", "owner.owner.sig", { filters: DEFAULT_FILTERS, profile: null });
    const statuses: number[] = [];
    for (let instance = 0; instance < 3; instance++) {
      // A fresh copy of the modules has an empty in-memory limiter, as a new serverless instance does.
      vi.resetModules();
      const { POST } = await load("search-jobs");
      for (let i = 0; i < 5; i++) statuses.push((await POST!(search())).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(12);
    expect(statuses.slice(12)).toEqual([429, 429, 429]);
  });

  it("is refused, not let through, when the shared limit cannot be checked", async () => {
    limiter = "broken";
    const { POST } = await load("search-jobs");
    const res = await POST!(request("search-jobs", "owner.owner.sig", { filters: DEFAULT_FILTERS, profile: null }));
    expect(res.status).toBe(503);
  });
});

describe("paid AI is off unless switched on", () => {
  it("a key alone does nothing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
    vi.stubEnv("AI_ENABLED", "");
    vi.stubEnv("RECRUITER_WEB_SEARCH", "1");
    const { GET } = await load("status");
    const body = await (await GET!(request("status", "owner.owner.sig", {}, "GET"))).json();
    expect(body).toMatchObject({ ai: false, model: null, recruiterWebSearch: false });
    const { POST } = await load("interview-prep");
    expect((await POST!(request("interview-prep", "owner.owner.sig"))).status).toBe(503);
    expect(calls.every((c) => c.startsWith("/auth/") || c.startsWith("/rest/"))).toBe(true);
  });
});

describe("private details stay out of responses and logs", () => {
  const SECRET = "Jane Candidate jane.candidate@mail.example 416-555-0123";

  it("status never returns a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-secret-value");
    vi.stubEnv("ADZUNA_APP_ID", "adzuna-secret-id");
    vi.stubEnv("ADZUNA_APP_KEY", "adzuna-secret-key");
    const { GET } = await load("status");
    expect(await (await GET!(request("status", "owner.owner.sig", {}, "GET"))).text()).not.toMatch(/secret/);
  });

  it("a failing AI call logs the kind of error, not what was in it", async () => {
    vi.resetModules();
    vi.doMock("@/lib/anthropic", async (original) => ({
      ...(await original<typeof import("@/lib/anthropic")>()),
      isAiConfigured: () => true,
      callStructured: async () => {
        throw new TypeError(`bad reply while reading ${SECRET}`);
      },
    }));
    const { POST } = await load("analyze-resume");
    const res = await POST!(request("analyze-resume", "owner.owner.sig", { text: `${SECRET}. Data engineer with nine years of Python and SQL work.` }));
    const warning = (await res.json()).warning as string;
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("analyze-resume failed: TypeError");
    expect(logged + warning).not.toMatch(/Jane|jane\.candidate|555-0123/);
    vi.doUnmock("@/lib/anthropic");
  });

  it("no server code logs an error message or object", () => {
    const offenders = files(SRC)
      .filter((f) => /\.ts$/.test(f) && !f.endsWith(`${sep}log.ts`))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .filter((line) => /console\.(log|info|warn|error|debug)\(/.test(line) && !/err\.name/.test(line))
          .map((line) => `${relative(SRC, f)}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the cloud copy of a resume leaves out contact details, and a pull does not strip this device", () => {
    const text = `${SECRET} linkedin.com/in/jane-candidate +44 20 7946 0958\nData Engineer, Acme, 2019 - 2023. Cut costs 1,250,000 to 900,000.`;
    const local = { resumes: [{ id: "r1", text }], contacts: undefined } as unknown as AppData;
    const sent = forCloud(local);
    expect(sent.resumes[0].text).not.toMatch(/jane\.candidate@|555-0123|in\/jane|7946/);
    expect(sent.resumes[0].text).toContain("2019 - 2023. Cut costs 1,250,000 to 900,000.");
    expect(local.resumes[0].text).toBe(text);
    expect(restoreContactDetails(local, sent).resumes[0].text).toBe(text);
    const edited = { ...sent, resumes: [{ ...sent.resumes[0], text: "A newer version from another device." }] } as AppData;
    expect(restoreContactDetails(local, edited).resumes[0].text).toBe("A newer version from another device.");
  });

  it("removing contact details stays fast on hostile text", () => {
    const started = performance.now();
    for (const text of ["a".repeat(60_000), "a@".repeat(30_000), "1 ".repeat(30_000), `+1${" 22".repeat(20_000)}x`, "a.".repeat(30_000)]) withoutContactDetails(text);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("headers and the database", () => {
  it("sends security headers on every page and no caching on the API", async () => {
    const rules = await nextConfig.headers!();
    const all = Object.fromEntries(rules.find((r) => r.source === "/:path*")!.headers.map((h) => [h.key, h.value]));
    expect(all["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(all["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(all["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(all).toMatchObject({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
    expect(rules.find((r) => r.source === "/api/:path*")!.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
  });

  it("uses no storage buckets, so there is no stored file to expose", () => {
    const sql = files(join(SRC, "..", "supabase", "migrations")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(sql).not.toMatch(/storage\.(buckets|objects)/i);
    expect(files(SRC).filter((f) => /\.storage\.from\(/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
