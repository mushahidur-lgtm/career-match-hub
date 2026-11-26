# API reference

[Home](../README.md)

## Contents
[Conventions](#conventions) · [Summary](#summary) · [Routes](#routes)

## Conventions
JSON in and out (except file upload). Errors are `{ "error": "message" }`. Rate limits are per client
(first `x-forwarded-for` value) per server instance, and answer 429 with `Retry-After`. Responses never contain
keys or prompts. No CORS headers are set, so browsers on other origins cannot read responses.

## Summary

| Endpoint | Method | Purpose | Sign-in | Per minute | Source |
| --- | --- | --- | --- | --- | --- |
| `/api/status` | GET | Which features are on | no | none | [route](../../src/app/api/status/route.ts) |
| `/api/parse-resume` | POST | File to text | no | 20 | [route](../../src/app/api/parse-resume/route.ts) |
| `/api/analyze-resume` | POST | Resume to profile | no | 15 | [route](../../src/app/api/analyze-resume/route.ts) |
| `/api/search-jobs` | POST | Search and score | no | 12 | [route](../../src/app/api/search-jobs/route.ts) |
| `/api/job-insights` | POST | Resume advice for one job | no | 10 | [route](../../src/app/api/job-insights/route.ts) |
| `/api/interview-prep` | POST | Practice questions | no | 10 | [route](../../src/app/api/interview-prep/route.ts) |
| `/api/networking-draft` | POST | Message draft | if enforced | 10 | [route](../../src/app/api/networking-draft/route.ts) |
| `/api/find-recruiter` | POST | Web search for contacts | if enforced | 3 (12 per hour) | [route](../../src/app/api/find-recruiter/route.ts) |
| `/api/job-check` **[PR 7]** | POST | Enrich and verify one job | if enforced | 15 | [route](../../src/app/api/job-check/route.ts) |
| `/api/job-assessment` **[PR 7]** | POST | Deep assessment | no | 6 | [route](../../src/app/api/job-assessment/route.ts) |
| `/api/cron/daily` | POST | Morning run | `Bearer CRON_SECRET` | none | [route](../../src/app/api/cron/daily/route.ts) |

"If enforced" means when the Supabase URL **and** service role key are set
([authentication](authentication.md)). Exact schemas are the Zod objects in each route.

## Routes

### GET /api/status
Response: `{ ai, model, jobProvider: "adzuna"|"jsearch"|"demo"|"none", recruiterWebSearch }`;
**[PR 7]** adds `providers[]`, `providerMode`, `pageChecks`. Calls no outside service.

### POST /api/parse-resume
Request: multipart form, field `file` (PDF, DOCX, TXT, MD; at most 4 MB).
Response: `{ text, fileName, warning }`. Errors: 400, 413, 415, 422, 429.

### POST /api/analyze-resume
Request: `{ text }` (at least 50 characters; first 60,000 used).
Response: `{ profile, warning }`. Without a key or on AI failure the profile comes from the keyword engine.

### POST /api/search-jobs
Request: `{ filters: { query, location, category, workMode, employmentType, minSalary }, profile|null,
resumeText?, preferences? }`.
Response: `{ jobs[], mode: "live"|"demo"|"unconfigured", provider, scoring: "ai"|"heuristic"|"mixed"|"none",
warnings[], excluded?[], ai?: { status, shortlisted, reviewed, calls, cached, model } }`; **[PR 7]** `sources?[]`.
`jobs` holds recommendations only; ineligible and closed jobs are in `excluded`.
Errors: 400 invalid input, 429. Provider and AI failures return 200 with warnings.

### POST /api/job-insights
Request: `{ job: { title, company, location, workMode, description, match }, resumeText, profile }`.
Response: `{ insights }`. Errors: 400, 429, 502 (AI failed), 503 (no key).

### POST /api/interview-prep
Request: `{ job, resumeText, profile, stage, format }`. Response: `{ prep }`. Errors: 400, 429, 502, 503.

### POST /api/networking-draft
Request: `{ kind: "connection"|"intro"|"follow-up"|"email", contact, job, ... }`.
Response: `{ draft: { kind, subject, body, ai } }` or `{ draft: null, note }` (no key, rejected or failed draft).
Errors: 400, 401, 403, 429.

### POST /api/find-recruiter
Request: `{ jobKey, title, company, location, applyUrl, source, category?, description? (3,000), exclude?, pass? }`.
A web lookup answers as a stream of newline-delimited JSON (`application/x-ndjson`) that carries progress and
the result with `candidates`, `note` and `searches`; see the route for the line shapes. Disabled lookups return
ordinary JSON with 200 and a note. Errors: 400, 401, 403, 429.

### POST /api/job-check [PR 7]
Request: `{ job: { id, title, company, source, applyUrl, description, descriptionTruncated, postedAt } }`.
Response: `{ description, descriptionTruncated, enrichment, verification, postingStatus, postingNotes }`.
Errors: 400, 401, 403, 429, 502.

### POST /api/job-assessment [PR 7]
Request: `{ job: { title, company, location, workMode, description, descriptionTruncated, postingStatus? },
resumeText, profile, preferences? }`.
Response: `{ status: "complete"|"unavailable"|"failed", rules, ai|null, notes, at, model }`.
Errors: 400, 429. AI problems return 200 with `status`.

### POST /api/cron/daily
Header `Authorization: Bearer <CRON_SECRET>`; body `{ force? }`. Response `{ results: [{ status, reason?,
searches?, jobs? }] }`. Errors: 401, 500, 503.
