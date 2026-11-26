# Security overview

[Home](../README.md) · [SSRF protection](ssrf-protection.md) · [Findings](known-risks.md)

## Contents
[Auth](#authentication-and-authorization) · [API](#api-security) · [Input](#input-validation) · [Uploads](#file-uploads) · [Secrets](#secrets-management) · [Sensitive data](#sensitive-data) · [Dependencies](#dependencies-and-scanning)

## Authentication and authorization
[Authentication](../04-technical-reference/authentication.md). Sessions and tokens are managed by the Supabase
client. Several costly routes do not require sign-in.

## API security
| Control | State |
| --- | --- |
| Rate limiting | Per route, in memory, per instance, keyed on `x-forwarded-for` |
| CORS | No headers set on API routes, so other origins cannot read responses; non-browser clients are unaffected |
| CSRF | No cookies authenticate API calls (bearer tokens only) |
| Security headers | Only the platform's HSTS was seen on the live site; no `Content-Security-Policy`, `X-Frame-Options` or `X-Content-Type-Options` (checked 2026-11-26) |

## Input validation
Zod or explicit checks on each route; stored and imported data validated on load; posting text stripped of
markup and instruction-like content; AI output schema-checked. CSV export neutralises formula prefixes
([format.ts](../../src/lib/format.ts)). React escapes rendered text; apply links pass through `safeUrl`
([job-parts.tsx](../../src/components/job-parts.tsx)).

## File uploads
4 MB limit, extension plus magic-byte checks, parsed in memory with `pdf-parse` or `mammoth`, not stored
([parse-resume](../../src/app/api/parse-resume/route.ts)). Parser libraries process untrusted files on the
server; keep them updated.

## External requests
Fixed API hosts for job boards and Anthropic. The only user-influenced address is the **[PR 7]** page reader:
[SSRF protection](ssrf-protection.md).

## Secrets management
Server keys are read from environment variables in server-only modules; `/api/status` reports presence, never
values. `.env*` files are git-ignored. GitHub secret scanning and push protection are enabled. Never put a
secret in a `NEXT_PUBLIC_` variable.

## Sensitive data
Resume text, applications, contacts and eligibility facts are stored **unencrypted in `localStorage`**: anyone
with access to the browser profile, or any script that ran on the origin, could read them. With sync on, a copy
is in your Supabase project. Backups contain the resume. Logging detail:
[error handling](../04-technical-reference/error-handling.md#logging). The repository is public: never commit
backups or personal data.

## Dependencies and scanning
Dependabot version updates weekly; Dependabot alerts and dependency graph enabled (0 open alerts on
2026-11-26); dependency review on pull requests; CodeQL on pull requests, `main` and weekly. `npm audit
--omit=dev` reported 0 vulnerabilities during the Phase 2 audit. Branch protection is **off**, so failing checks
do not block a merge.
