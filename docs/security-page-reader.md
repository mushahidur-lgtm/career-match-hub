# Security audit: reading job application pages

**Scope:** `lib/net/{safe-fetch,robots}`, `lib/jobs/{job-systems,job-page,jsonld,enrich,verify,check}`,
`lib/html`, `/api/job-check`. **CodeQL alert 12** (`js/request-forgery`, `safe-fetch.ts`).
**Status of the alert:** open. Proposed for "accepted, mitigated risk"; not dismissed.

## Found and fixed during the audit

| Finding | Severity | Fix |
| --- | --- | --- |
| HTML and robots parsing took quadratic time. A hostile page of up to 1.5 MB could block the server's single thread for minutes, and anyone can publish a page on several allowed job systems | High (denial of service, only with page reads on; the HTML stripper also read job-board text) | `lib/html.ts` single-pass scanners; robots lines split by hand; guard input capped |
| Connections were pooled, so a later request to the same host skipped its address check; the shared agent can also be redirected through a proxy | Medium (hardening) | `agent: false`, certificate checking stated explicitly |
| `168.63.129.16`, `2001::/23` and `3fff::/20` were treated as public | Low | blocked |
| The allowed list was enforced by the caller and on redirects, not by the fetcher on its first request | Low (defence in depth) | fetcher checks it too |

## Controls

| Requirement | Control | Tests (`tests/page-reader-security.test.ts` unless noted) |
| --- | --- | --- |
| HTTPS and allowed hosts only | `isJobSystemUrl`: https, no credentials or port, exact host or true subdomain | names and spellings; `job-check.test.ts` |
| Public addresses only | every DNS answer checked; IPv4 block list; IPv6 only global unicast minus special ranges | addresses; DNS |
| Rebinding / check-then-use | one lookup, connection pinned to the checked address, no pooling | rebinding; real connection |
| Redirects | followed by hand; URL, allowed list, DNS and address checked each hop; at most 3 | redirects |
| Limits | 8 s per page across all hops, 4 s for robots.txt; 1.5 MB and 200 KB; text types only; no decompression | limits |
| Nothing forwarded | fresh GET with `Host`, `User-Agent`, `Accept`, `Accept-Encoding`, `Connection`; no cookie store; caller's headers never copied | real connection |
| Safe responses | errors reduced to fixed sentences; page text is parsed, never executed | `job-check.test.ts` |
| Off by default | only `JOB_PAGE_FETCH=1` | off by default |

## Why CodeQL still reports it

The query follows the apply link from the request body to `https.request`. It does not treat this project's
host list, address check or pinned lookup as barriers. The flow it describes is real and intended: the
feature exists to request an address the browser supplies.

## Residual risk (accepted if the alert is dismissed)

* A caller allowed to use `/api/job-check` can make the server GET any path and query **on the listed job
  systems**, from the server's IP address, and can obtain some of a page's text. A GET that changes something
  on one of those sites would be sent.
* Anyone can publish content on several of these systems; it is treated as untrusted data.
* Without cloud sync, only a per-instance rate limit applies, keyed on a header a client can influence
  outside Vercel. Each uncached URL means new requests.
* Trust rests on the listed vendors' DNS and certificates.
* Address ranges are a block list for IPv4; a deployment with its own public-numbered internal services, or a
  network-specific NAT64 prefix, would not be covered.

## Outside this feature

The JSearch detail lookup in the same route runs even with page reads off. It calls a fixed host, but
`fetch` follows redirects and would forward the API key header if JSearch ever redirected. This also applies
to the existing search calls on `main`.

## Conditions for enabling

Set `JOB_PAGE_FETCH=1` only if the site is protected (sign-in or deployment protection), or you accept that
visitors can use it as described. Unset it to switch page reads off at once.

## Not verified

No request to a real job system or DNS rebinding service was made. Tests use stand-ins and a local server.
CodeQL has not analysed the fixes above until they are pushed.
