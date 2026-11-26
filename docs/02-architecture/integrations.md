# External services and integrations

[Home](../README.md)

| Service | Used for | Code | Auth | Limits and failures |
| --- | --- | --- | --- | --- |
| Adzuna API | Job search | [adzuna.ts](../../src/lib/providers/adzuna.ts) | `ADZUNA_*` as query parameters | Returns about the first 500 characters of a description |
| JSearch (RapidAPI) | Job search; **[PR 7]** job details | [jsearch.ts](../../src/lib/providers/jsearch.ts) | `RAPIDAPI_KEY` header | Full descriptions |
| Anthropic Messages API | Resume reading, match review, suggestions, interview practice, drafts, **[PR 7]** assessment | [anthropic.ts](../../src/lib/anthropic.ts) | `ANTHROPIC_API_KEY` | 50 s timeout, 1 retry; model fallback |
| Anthropic web search and web fetch tools | Recruiter finder | [web-search.ts](../../src/lib/contacts/web-search.ts) | same key | Billed per search; no retry |
| Supabase | Sign-in, sync, morning-run storage | [cloud/](../../src/lib/cloud) | anon key (browser), service key (server) | Free projects may pause; check current terms |
| Job application systems **[PR 7]** | Optional page reads | [safe-fetch.ts](../../src/lib/net/safe-fetch.ts) | none | See [SSRF protection](../07-security/ssrf-protection.md) |
| Google, Bing, LinkedIn | Search links you click yourself | [links.ts](../../src/lib/contacts/links.ts) | none | The app never fetches them |

## Provider behaviour

* **Order.** `fallback` mode (default) uses the first source that answers; `all` queries both and merges
  ([index.ts](../../src/lib/providers/index.ts)).
* **Errors.** Rejected keys, rate limits and outages become readable warnings. **[PR 7]**: one retry for network
  errors and 5xx (not 401, 403, 429), 10 s per attempt, partial results across countries, a `sources` report.
* **Never invented.** Sample jobs appear only in development or with `CMH_DEMO=1`.
* **Adding a provider:** implement `JobSearchProvider` and add it to `PROVIDERS`.

The app does no scraping of job boards.
