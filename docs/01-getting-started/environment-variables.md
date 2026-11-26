# Environment variables

[Home](../README.md)

Every key is optional. Locally use `.env.local` (git-ignored); in production use Vercel project settings.
Names only appear here; never commit values. [.env.example](../../.env.example) is the commented template.

## AI

| Name | Default | Effect |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Turns on Claude features |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Model override. The code comment says that model retires 2026-11-30; the app then falls back to `claude-sonnet-5-5` ([anthropic.ts](../../src/lib/anthropic.ts)) |
| `AI_SHORTLIST` | 20 | Jobs Claude reviews per search, 0 to 60 |
| `ANTHROPIC_BASE_URL` | SDK default | Read by the Anthropic SDK; if set in your shell, requests go there |

## Job sources

| Name | Default | Effect |
| --- | --- | --- |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | none | Adzuna search (tried first) |
| `RAPIDAPI_KEY` | none | JSearch search |
| `JOB_PROVIDER_MODE` | `fallback` | `all` queries every configured source and merges |
| `ADZUNA_PAGES` **[PR 7]** | 1 | Result pages per search, 1 to 3; each is another API call |
| `CMH_DEMO` | off | `1` allows sample jobs in a production build |

## Posting checks **[PR 7]**

| Name | Default | Effect |
| --- | --- | --- |
| `JOB_PAGE_FETCH` | **off** | Only the value `1` lets the server read job application pages. Read [SSRF protection](../07-security/ssrf-protection.md) first |
| `JOB_CACHE_HOURS` | 24 | Server-memory cache of page summaries |

## Recruiter finder

| Name | Default | Effect |
| --- | --- | --- |
| `RECRUITER_WEB_SEARCH` | off | `1` enables paid web lookups. Also enabled when sign-in is enforced |
| `FIND_RECRUITER_MAX_PER_HOUR` | 20 | Per server instance, 1 to 200 |

## Cloud sync and morning run

| Name | Visibility | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Public**, fixed at build time | Turns on sign-in and sync in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server secret**; bypasses row-level security | Morning run, and server-side sign-in enforcement |
| `SUPABASE_URL` | Server | Optional alias of the public URL |
| `CRON_SECRET` | Server and GitHub secret | At least 16 characters; protects the morning-run endpoint |
| `DAILY_RUN_EMAILS` | Server | Accounts that get a morning run and may use sign-in-protected routes |
| `DAILY_MAX_SEARCHES` | 12 (1 to 30) | Job-board calls per morning |
| `DAILY_BUDGET_SECONDS` | 200 (5 to 280) | Time the run may spend |

> Sign-in is **enforced on the server only when the service role key is also set**. With just the two public
> values, sync works but no route requires sign-in. See [authentication](../04-technical-reference/authentication.md).

## GitHub repository secrets

`SITE_URL` and `CRON_SECRET`, for [daily-run.yml](../../.github/workflows/daily-run.yml). None were set on
2026-11-26.

## Test and tooling variables

`PW_CHANNEL` (use installed Chrome or Edge for smoke tests), `CI`, and for the comparison and benchmark
scripts `CMH_WRITE_BASELINE`, `CMH_PRINT_COMPARISON`, `CMH_BENCH_REPORT`, `CMH_BENCH_BACKUP` **[PR 7]**.
