# Security findings and known risks

[Home](../README.md) · [Security overview](security-overview.md)

Observed 2026-11-26. Severity is this documentation's judgement unless a scanner is named. "Fixed" is used only
where code and tests support it.

| # | Finding | Severity | Evidence | Current status | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 1 | AI and job-board routes do not require sign-in, so visitors can spend the owner's quota | High where keys are set on a public site; low in production today (no AI key) | `search-jobs`, `analyze-resume`, `job-insights`, `interview-prep`, `job-assessment` **[PR 7]** have no `requireSignedIn`; README warns of it | Open | Require sign-in on these routes, or use Vercel protection and firewall limits |
| 2 | Rate limits are per instance and keyed on a client-influenced header off Vercel | Medium | [rate-limit.ts](../../src/lib/rate-limit.ts) | Open | Platform-level limits |
| 3 | Regular expressions that can stall on crafted text | High (CodeQL) | Alerts 1, 2, 9 open on `main` | Fixed in PR 7 (timing tests); **still in production** | Merge PR 7 or backport |
| 4 | HTML stripping on `main` takes quadratic time on crafted job-board text | Medium | Found in the Phase 2 audit | Fixed in PR 7 ([html.ts](../../src/lib/html.ts), tests); **still in production** | Same |
| 5 | Request forgery on the page reader | Critical (CodeQL rating); residual by design | Alert 15 on PR 7 | Open, mitigated, off by default; not in production | See [SSRF protection](ssrf-protection.md) |
| 6 | Sensitive data stored as clear text | High (CodeQL) | Alert 3 on `main`, [use-persistent-state.ts](../../src/lib/use-persistent-state.ts) | Open; inherent in browser-only storage | Decide and record: accept, or encrypt and handle keys |
| 7 | No Content-Security-Policy or framing protection | Medium | Live response headers | Open | Add headers in `next.config.ts` |
| 8 | JSearch requests follow redirects with the API key header | Low | `fetch` in [providers/common.ts](../../src/lib/providers/common.ts) | Open | Set `redirect: "error"` for provider calls |
| 9 | Error messages are logged by several routes and may carry input fragments | Low | [error handling](../04-technical-reference/error-handling.md#logging) | Open | Log error names only |
| 10 | Sign-in enforcement silently depends on the service role key | Medium (misconfiguration) | [auth.ts](../../src/lib/cloud/auth.ts) | Open (documented) | Warn at startup, or enforce when the public values are set |
| 11 | Signed-in users are all allowed when `DAILY_RUN_EMAILS` is empty | Low | same | Open | Set the list; disable sign-ups |
| 12 | `main` has no branch protection | Medium | GitHub API | Open | Require CI checks before merge |
| 13 | Deployment smoke check has never run | Low (assurance gap) | No workflow runs found | Open | Confirm Vercel sends deployment status to GitHub, or run it by hand |
| 14 | Prompt-injection filtering is pattern-based | Low | [sanitize.ts](../../src/lib/jobs/sanitize.ts) | Accepted; bounded output and no tools are the main controls | Keep AI output bounded |

Do not dismiss scanner alerts or relax checks only to get a green build.
