# Error handling and logging

[Home](../README.md)

## Principles
Fail readably, keep working with less, never invent data.

| Failure | Behaviour | Source |
| --- | --- | --- |
| Invalid request | 400 with a plain message | `badRequest` in [rate-limit.ts](../../src/lib/rate-limit.ts) |
| Too many requests | 429 with `Retry-After` | same |
| Job board error | Warning; next source; none → empty list | [providers/index.ts](../../src/lib/providers/index.ts) |
| AI error during search | Rule-based results with a warning | [search-jobs](../../src/app/api/search-jobs/route.ts) |
| AI error on a button | 502 with `describeAiError` message, or a status object | [anthropic.ts](../../src/lib/anthropic.ts) |
| Retired model | Switches to the fallback model | same |
| Broken stored data | Set aside under `cmh:recovered:*`, downloadable | [use-persistent-state.ts](../../src/lib/use-persistent-state.ts) |
| Storage full | Banner; search history trims itself | [storage-health.ts](../../src/lib/storage-health.ts) |
| UI crash | [error.tsx](../../src/app/error.tsx), [global-error.tsx](../../src/app/global-error.tsx) | |

## Logging
Only `console.error` (and the error page's `console.error`), visible in Vercel function logs. No structured
logging or error-tracking service.

What is logged differs by route:

* Name only: `job-check` **[PR 7]**, search review, deep assessment **[PR 7]**.
* **Error message**: `analyze-resume`, `parse-resume`, `job-insights`, `interview-prep`, `networking-draft`,
  `find-recruiter`, the daily run and provider calls. A message could contain fragments of input or a reply.
  See [known risks](../07-security/known-risks.md).
