# Troubleshooting and FAQ

[Home](../README.md)

## Contents
[Setup](#setup) · [API errors](#api-errors) · [Integrations](#integration-issues) · [Deployment](#deployment-issues) · [FAQ](#faq)

## Setup
| Problem | Fix |
| --- | --- |
| "No job source is connected" after adding keys | Restart the dev server; check variable names |
| `npm ci` fails with `EPERM` on Windows | Stop any running Next server, retry |
| Smoke tests fail locally | `npm run build` first; install the browser or set `PW_CHANNEL`; free port 3100 |

## API errors
| Status / message | Meaning |
| --- | --- |
| 400 "... not valid" | Request failed validation |
| 401 / 403 on drafts, recruiter search or job check | Sign-in required or account not listed |
| 413 / 415 / 422 on upload | Too large; unsupported or mismatched type; no readable text (scanned PDF) |
| 429 | Rate limit; wait for `Retry-After` |
| 502 | The AI call failed |
| 503 | Feature needs a key or database that is not configured |

## Integration issues
| Problem | Check |
| --- | --- |
| "Adzuna rejected the API credentials" | Both `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`, no spaces |
| "rate limit reached" | Your job-board plan; the morning run also uses it |
| "The Anthropic API key was rejected" / "out of credits" | Key and billing |
| Claude calls go elsewhere | `ANTHROPIC_BASE_URL` in your shell |
| Model deprecation warning | Set `ANTHROPIC_MODEL=claude-sonnet-5-5` |
| Recruiter search button missing | Needs a key and `RECRUITER_WEB_SEARCH=1` (or enforced sign-in), then redeploy |
| Sync does nothing after adding Supabase values | `NEXT_PUBLIC_*` are fixed at build time: redeploy |
| Morning run never appears | Repository secrets `SITE_URL`, `CRON_SECRET`; server variables; synced data |
| Posting shows "Not verified" **[PR 7]** | `JOB_PAGE_FETCH` unset, or the link is not on an allowed job system |

## Deployment issues
| Problem | Check |
| --- | --- |
| Build fails on Vercel only | Node version; `npm ci` with the committed lock file; variables needed at build |
| Function times out | Plan limit against the route's `maxDuration` |
| Dependency review errors "not supported" | Enable the dependency graph |
| CodeQL fails | Read the alert under Security → Code scanning; fix, or decide on dismissal with a recorded reason |

## FAQ
**Why are there no jobs on a fresh deployment?** No job key: production never shows samples.

**Why did a score drop when I changed nothing in the posting?** Weights, skills or preferences changed, or the
new version counts a skill that is only listed at 25%.

**Does the app apply for me or send messages?** No.

**Where is my data?** In your browser, plus your own Supabase project if sync is on.

**Why is a strong job under "verify"?** The posting states a condition you have not answered in Settings.

**Why no AI review on the live site?** No Anthropic key was configured there on 2026-11-26.
