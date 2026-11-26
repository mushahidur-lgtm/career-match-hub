import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * The only way this app reads a web page whose address came from outside. It refuses anything that is not a
 * public web server: the name is resolved here, every address is checked, and the connection is pinned to a
 * checked address, so a second DNS answer cannot redirect it inward. Redirects are followed by hand and each
 * hop is checked again.
 */

export type FetchFailure = "blocked_url" | "dns" | "timeout" | "network" | "too_large" | "bad_content" | "too_many_redirects";

export class SafeFetchError extends Error {
  constructor(public readonly kind: FetchFailure) {
    super(kind);
    this.name = "SafeFetchError";
  }
}

export const USER_AGENT = "CareerMatchHub/1.0 (job posting check)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

const blocked4 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  // Azure's platform address: public by number, but only reachable from inside that cloud.
  ["168.63.129.16", 32],
] as const) blocked4.addSubnet(net, bits, "ipv4");

// For IPv6 only ordinary global unicast is allowed, minus the ranges that wrap IPv4 addresses or are reserved.
// Loopback, link-local, unique-local and IPv4-mapped addresses all fall outside 2000::/3.
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
const blocked6 = new BlockList();
// 2001::/23 holds the protocol assignments (Teredo, benchmarking, ORCHID).
for (const [net, bits] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked6.addSubnet(net, bits, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked4.check(address, "ipv4");
  if (family === 6) return global6.check(address, "ipv6") && !blocked6.check(address, "ipv6");
  return false;
}

/** Returns the parsed address when it is one we are willing to look up at all. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("blocked_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const named = isIP(host) === 0;
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.port !== "" ||
    !host ||
    (named && (!host.includes(".") || /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|corp|test|invalid)\.?$/.test(host))) ||
    (!named && !isPublicAddress(host))
  ) {
    throw new SafeFetchError("blocked_url");
  }
  return url;
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Buffer | string>;
  close?: () => void;
}

export interface Transport {
  resolve(host: string): Promise<{ address: string; family: number }[]>;
  send(url: URL, pinned: { address: string; family: number }, signal: AbortSignal): Promise<RawResponse>;
}

export const realTransport: Transport = {
  resolve: (host) => dnsLookup(host, { all: true, verbatim: true }),
  send: (url, pinned, signal) =>
    new Promise((resolve, reject) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        url,
        {
          method: "GET",
          signal,
          // A new connection every time. A pooled socket would skip the address check below, and the shared
          // agent can also be pointed at a proxy that resolves names itself.
          agent: false,
          // Stated so that a process-wide override cannot switch certificate checks off for these requests.
          rejectUnauthorized: true,
          // The connection goes only to the address that was checked.
          lookup: ((_host: string, options: { all?: boolean }, cb: (err: Error | null, address: unknown, family?: number) => void) =>
            options?.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)) as never,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain;q=0.8", "Accept-Encoding": "identity" },
        },
        (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, close: () => res.destroy() }),
      );
      req.on("error", reject);
      req.end();
    }),
};

export interface Page {
  status: number;
  /** Where the content finally came from, after redirects. */
  url: string;
  redirected: boolean;
  body: string;
}

export interface SafeFetchOptions {
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  /** Which addresses the caller is willing to read. Checked on the first request and on every redirect. */
  allowHop?: (url: URL) => boolean;
}

const header = (h: RawResponse["headers"], name: string) => ([] as string[]).concat(h[name] ?? [])[0] ?? "";

export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<Page> {
  const { transport = realTransport, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, allowHop } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new SafeFetchError("timeout")), { once: true }));
  timedOut.catch(() => undefined);
  const within = <T>(work: Promise<T>) => Promise.race([work, timedOut]);

  let url = checkUrl(raw);
  if (allowHop && !allowHop(url)) throw new SafeFetchError("blocked_url");
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: { address: string; family: number }[];
    try {
      addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await within(transport.resolve(host));
    } catch (err) {
      throw err instanceof SafeFetchError ? err : new SafeFetchError("dns");
    }
    if (!addresses.length) throw new SafeFetchError("dns");
    // One private answer among public ones is enough to refuse.
    if (!addresses.every((a) => isPublicAddress(a.address))) throw new SafeFetchError("blocked_url");

    let res: RawResponse;
    try {
      res = await within(transport.send(url, addresses[0], signal));
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      throw new SafeFetchError(signal.aborted ? "timeout" : "network");
    }

    const location = header(res.headers, "location");
    if (res.status >= 300 && res.status < 400 && location) {
      res.close?.();
      let target: string;
      try {
        target = new URL(location, url).toString();
      } catch {
        throw new SafeFetchError("blocked_url");
      }
      const next = checkUrl(target);
      if (allowHop && !allowHop(next)) return { status: res.status, url: next.toString(), redirected: true, body: "" };
      url = next;
      continue;
    }

    const type = header(res.headers, "content-type");
    if (res.status === 200 && type && !/text\/|application\/(?:xhtml|json|ld\+json|xml)/i.test(type)) {
      res.close?.();
      throw new SafeFetchError("bad_content");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      await within(
        (async () => {
          for await (const chunk of res.body) {
            const buffer = Buffer.from(chunk);
            size += buffer.length;
            if (size > maxBytes) throw new SafeFetchError("too_large");
            chunks.push(buffer);
          }
        })(),
      );
    } catch (err) {
      res.close?.();
      throw err instanceof SafeFetchError ? err : new SafeFetchError("network");
    }
    return { status: res.status, url: url.toString(), redirected: hop > 0, body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new SafeFetchError("too_many_redirects");
}
