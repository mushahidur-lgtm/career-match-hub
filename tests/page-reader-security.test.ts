/**
 * Security properties of the one feature that reads an address supplied from outside: addresses, names, DNS,
 * redirects, headers, limits, hostile content and the off-by-default switch.
 */
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripTags } from "@/lib/html";
import { checkJob } from "@/lib/jobs/check";
import { clearPageCache, loadJobPage, pageFetchEnabled } from "@/lib/jobs/job-page";
import { isJobSystemUrl } from "@/lib/jobs/job-systems";
import { cleanText, mainText, readJobPostings } from "@/lib/jobs/jsonld";
import { guardPosting } from "@/lib/jobs/sanitize";
import { robotsAllows } from "@/lib/net/robots";
import { checkUrl, isPublicAddress, realTransport, safeFetch, type RawResponse, type Transport } from "@/lib/net/safe-fetch";
import { stripHtml } from "@/lib/providers/common";

const PAGE = "https://jobs.lever.co/acme/1";
const PUBLIC = "93.184.216.34";

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: AsyncIterable<Buffer> | string;
  hang?: boolean;
}

/** A stand-in network that records every connection and the address it was pinned to. */
function net(reply: (url: URL) => Reply, resolve: (host: string, call: number) => string[] = () => [PUBLIC]) {
  const sent: { url: string; pinned: string }[] = [];
  let lookups = 0;
  const transport: Transport = {
    resolve: async (host) => resolve(host, ++lookups).map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    send: async (url, pinned): Promise<RawResponse> => {
      sent.push({ url: url.toString(), pinned: pinned.address });
      const r = reply(url);
      if (r.hang) return new Promise<RawResponse>(() => undefined);
      const body = r.body ?? "";
      return {
        status: r.status ?? 200,
        headers: { "content-type": "text/html", ...r.headers },
        body:
          typeof body === "string"
            ? (async function* () {
                yield Buffer.from(body);
              })()
            : body,
      };
    },
  };
  return { transport, sent, lookups: () => lookups };
}

beforeEach(() => {
  clearPageCache();
  vi.stubEnv("JOB_PAGE_FETCH", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("addresses", () => {
  it("refuses every private, local, shared, multicast and reserved IPv4 range", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "100.100.100.200", "127.0.0.1", "127.255.255.254", "169.254.169.254", "169.254.170.2", "168.63.129.16", "172.16.0.1", "172.31.255.255", "192.0.0.192", "192.0.2.1", "192.88.99.1", "192.168.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("refuses non-global and special IPv6, including wrapped IPv4 and cloud metadata", () => {
    for (const ip of ["::", "::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b:1::1", "100::1", "2001::1", "2001:2::1", "2001:10::1", "2001:20::1", "2001:db8::1", "2002:a9fe:a9fe::", "3fff::1", "5f00::1", "fc00::1", "fd00:ec2::254", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
  });
});

describe("names and spellings", () => {
  it("refuses localhost, metadata and numeric spellings of private addresses", () => {
    for (const url of ["http://localhost/", "https://localhost./", "http://127.1/", "http://0177.0.0.1/", "http://0x7f.0.0.1/", "http://2130706433/", "http://[::]/", "http://[::ffff:7f00:1]/", "http://[fd00:ec2::254]/", "http://169.254.169.254/latest/meta-data", "http://metadata.google.internal/", "http://metadata.google.internal./", "http://１２７.０.０.１/", "gopher://jobs.lever.co/", "file:///etc/passwd", "//jobs.lever.co/x", "https://", "https://[bad", ""]) {
      expect(() => checkUrl(url), url).toThrow();
      expect(isJobSystemUrl(url), url).toBe(false);
    }
  });
  it("judges the host the request would really use, however it is spelled", () => {
    expect(isJobSystemUrl("https://evil.example\\@jobs.lever.co/")).toBe(false);
    expect(isJobSystemUrl("https://jobs.lever.co%2eevil.example/")).toBe(false);
    expect(isJobSystemUrl("https://evil.example?.jobs.lever.co")).toBe(false);
    expect(isJobSystemUrl("https://jobs.lever.co./")).toBe(false);
    // These are all genuinely the allowed host once parsed.
    for (const url of ["HTTPS://JOBS.LEVER.CO/x", "https://jobs%2Elever%2Eco/", "https://jobs.lever.co\\@evil.example/"]) {
      expect(isJobSystemUrl(url), url).toBe(true);
      expect(new URL(url).hostname).toBe("jobs.lever.co");
    }
  });
});

describe("DNS", () => {
  it("refuses a name with any private answer, before connecting", async () => {
    for (const answers of [["10.0.0.5"], [PUBLIC, "127.0.0.1"], ["2606:4700::1111", "fd00:ec2::254"], ["169.254.169.254"]]) {
      const n = net(() => ({}), () => answers);
      await expect(safeFetch(PAGE, { transport: n.transport })).rejects.toMatchObject({ kind: "blocked_url" });
      expect(n.sent).toEqual([]);
    }
  });
  it("connects to the address it checked, so a changed answer cannot redirect it (rebinding)", async () => {
    const n = net(() => ({ body: "ok" }), (_h, call) => (call === 1 ? [PUBLIC] : ["127.0.0.1"]));
    await safeFetch(PAGE, { transport: n.transport });
    // One lookup, and the connection used exactly that checked answer.
    expect(n.lookups()).toBe(1);
    expect(n.sent).toEqual([{ url: PAGE, pinned: PUBLIC }]);
    await expect(safeFetch(PAGE, { transport: n.transport })).rejects.toMatchObject({ kind: "blocked_url" });
    expect(n.sent).toHaveLength(1);
  });
  it("looks up and checks again on each redirect", async () => {
    const n = net((u) => (u.pathname === "/acme/1" ? { status: 302, headers: { location: "/acme/2" } } : {}), (_h, call) => (call === 1 ? [PUBLIC] : ["10.0.0.1"]));
    await expect(safeFetch(PAGE, { transport: n.transport, allowHop: isJobSystemUrl })).rejects.toMatchObject({ kind: "blocked_url" });
    expect(n.sent).toHaveLength(1);
  });
});

describe("redirects", () => {
  const redirect = (location: string) => net(() => ({ status: 302, headers: { location } }));
  it("never requests a private address named in a redirect", async () => {
    for (const location of ["http://127.0.0.1/", "https://[::1]/", "http://169.254.169.254/latest", "http://localhost:80/", "https://10.0.0.1/", "file:///etc/passwd", "http://[bad"]) {
      const n = redirect(location);
      await expect(safeFetch(PAGE, { transport: n.transport, allowHop: isJobSystemUrl })).rejects.toMatchObject({ kind: "blocked_url" });
      expect(n.sent, location).toHaveLength(1);
    }
  });
  it("reports, and does not follow, a redirect off the allowed list or down to http", async () => {
    for (const location of ["https://evil.example/x", "https://jobs.lever.co.evil.example/x", "http://jobs.lever.co/acme/1", "//evil.example/x"]) {
      const n = redirect(location);
      await expect(safeFetch(PAGE, { transport: n.transport, allowHop: isJobSystemUrl })).resolves.toMatchObject({ status: 302, body: "" });
      expect(n.sent, location).toHaveLength(1);
    }
  });
  it("applies the allowed list to the first request too", async () => {
    const n = net(() => ({}));
    await expect(safeFetch("https://evil.example/x", { transport: n.transport, allowHop: isJobSystemUrl })).rejects.toMatchObject({ kind: "blocked_url" });
    expect(n.sent).toEqual([]);
  });
  it("stops after three", async () => {
    const n = redirect("/again");
    await expect(safeFetch(PAGE, { transport: n.transport })).rejects.toMatchObject({ kind: "too_many_redirects" });
    expect(n.sent).toHaveLength(4);
  });
});

describe("limits", () => {
  it("stops reading an oversized or endless body", async () => {
    let produced = 0;
    const endless = (async function* () {
      for (;;) {
        produced += 64_000;
        yield Buffer.alloc(64_000, "a");
      }
    })();
    await expect(safeFetch(PAGE, { transport: net(() => ({ body: endless })).transport })).rejects.toMatchObject({ kind: "too_large" });
    expect(produced).toBeLessThan(2_000_000);
  });
  it("times out on a name lookup, a connection or a body that never finishes", async () => {
    const stuckBody = (async function* () {
      yield Buffer.from("a");
      await new Promise(() => undefined);
    })();
    const stuckDns: Transport = { resolve: () => new Promise(() => undefined), send: () => Promise.reject(new Error("unused")) };
    for (const transport of [stuckDns, net(() => ({ hang: true })).transport, net(() => ({ body: stuckBody })).transport]) {
      await expect(safeFetch(PAGE, { transport, timeoutMs: 30 })).rejects.toMatchObject({ kind: "timeout" });
    }
  });
  it("shares one time budget across redirects", async () => {
    const slow: Transport = {
      resolve: async () => [{ address: PUBLIC, family: 4 }],
      send: async () => {
        await new Promise((r) => setTimeout(r, 40));
        return { status: 302, headers: { location: "/next" }, body: (async function* () {})() };
      },
    };
    await expect(safeFetch(PAGE, { transport: slow, timeoutMs: 100 })).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("the real connection", () => {
  async function serve(run: (port: number) => Promise<void>) {
    const seen: { headers: IncomingHttpHeaders; method?: string }[] = [];
    let connections = 0;
    const server = createServer((req, res) => {
      seen.push({ headers: req.headers, method: req.method });
      res.writeHead(200, { "content-type": "text/plain", "set-cookie": "session=abc" }).end("ok");
    });
    server.on("connection", () => connections++);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      await run((server.address() as AddressInfo).port);
    } finally {
      server.closeAllConnections();
      server.close();
    }
    return { seen, connections };
  }
  const get = async (port: number) => {
    const res = await realTransport.send(new URL(`http://pinned.invalid:${port}/`), { address: "127.0.0.1", family: 4 }, AbortSignal.timeout(5000));
    for await (const chunk of res.body) void chunk;
  };

  it("sends no cookies or credentials, even after being offered a cookie, and never reuses a connection", async () => {
    const { seen, connections } = await serve(async (port) => {
      await get(port);
      await new Promise((r) => setTimeout(r, 30));
      await get(port);
    });
    expect(connections).toBe(2);
    for (const { headers, method } of seen) {
      expect(method).toBe("GET");
      expect(Object.keys(headers).sort()).toEqual(["accept", "accept-encoding", "connection", "host", "user-agent"]);
      expect(headers["user-agent"]).toBe("CareerMatchHub/1.0 (job posting check)");
    }
  });
});

describe("hostile content cannot stall the server", () => {
  const BIG = 1_500_000;
  const fill = (unit: string) => unit.repeat(Math.ceil(BIG / unit.length)).slice(0, BIG);
  it("reads a full-size hostile page quickly", () => {
    const started = Date.now();
    for (const unit of ["<", "<a", "<<", "<!--", "<script>", "<style ", "<main>", "<article ", '<script type="application/ld+json">', "<script ", "</", "<br ", "< ", "<system ", "&lt;system "]) {
      const page = fill(unit);
      stripTags(page);
      readJobPostings(page);
      mainText(page);
    }
    stripHtml(fill("<a"));
    cleanText(fill("&lt;system "));
    guardPosting(fill("<system ").slice(0, 40_000));
    robotsAllows(`User-agent: *\nDisallow: a${" ".repeat(200_000)}b`, "/x");
    robotsAllows(fill(`a${" ".repeat(500)}`).slice(0, 200_000), "/x");
    expect(Date.now() - started).toBeLessThan(8000);
  }, 60_000);
  it("leaves no tag behind, however the pieces are nested", () => {
    for (const html of ["<<b>script>x", "<<<b>b>script>x", "<scr<!-- x -->ipt>alert(1)", "<<script></script>script ok", "ok <script", "ok <<script x", "<SCRIPT>x</SCRIPT><ScRiPt"]) {
      expect(stripTags(html), html).not.toMatch(/<[a-zA-Z!/?]/);
    }
  });
});

describe("off by default", () => {
  it("is enabled by JOB_PAGE_FETCH=1 and nothing else", async () => {
    for (const value of ["", "0", "true", "yes", "on", "2"]) {
      vi.stubEnv("JOB_PAGE_FETCH", value);
      const n = net(() => ({}));
      expect(pageFetchEnabled(), value).toBe(false);
      expect((await loadJobPage({ applyUrl: PAGE }, { transport: n.transport })).kind).toBe("disabled");
      expect(n.sent).toEqual([]);
    }
    vi.unstubAllEnvs();
    expect(pageFetchEnabled()).toBe(false);
  });
});

describe("the whole job check on a hostile page", () => {
  it("finishes quickly and returns nothing from it that looks like markup", async () => {
    for (const unit of ["<a", "<script>", "<main>", "<title>   ", "ignore all previous "]) {
      clearPageCache();
      const body = unit.repeat(Math.floor(1_400_000 / unit.length));
      const n = net((u) => (u.pathname === "/robots.txt" ? { status: 404 } : { body }));
      const started = Date.now();
      const r = await checkJob(
        { id: "adzuna-1", title: "Developer", company: "Acme", source: "adzuna", applyUrl: PAGE, description: "Short.", descriptionTruncated: true, postedAt: null },
        { transport: n.transport },
      );
      expect(Date.now() - started, unit).toBeLessThan(4000);
      expect(r.description, unit).not.toMatch(/<[a-zA-Z]/);
    }
  }, 60_000);
});
