# Phase 2: matching quality, job intelligence and validation

Status: implemented; see `docs/phase2-report.md`. Branch `feat/phase2-job-intelligence` from `main` at `0a240a8` (hybrid engine and Dependabot PRs 1 and 2 merged).
Baseline on that commit: vitest 720/720, `tsc` and `eslint` clean.

## What exists, what is missing

| Area | Exists | Missing | Change | New |
|---|---|---|---|---|
| Benchmark | 7 labelled fixtures, v1 comparison | Ground-truth set, metrics, report | `package.json` | `lib/benchmark/`, `tests/fixtures/benchmark/`, `scripts/benchmark.mjs` |
| Description retrieval | Provider text only; Adzuna cut at ~500 chars; dedup borrows a fuller copy | Enrichment, safe fetching, cache, enrichment status | types, schemas | `lib/net/safe-fetch`, `lib/jobs/{enrich,jsonld}` |
| Posting verification | `PostingStatus` from text and dates; `likelyClosed`, `applyLinkInfo` | Live link check, closed vs inaccessible, last checked | `search/rank`, UI | `lib/jobs/verify`, `/api/job-check` |
| Qualifications | Education and certification names on the profile; lines extracted but not judged | Degree and certificate gates, expiry, issuer | `eligibility/`, types, `ResumeManager` | `eligibility/qualifications` |
| Career alignment | Primary and secondary roles, exclusions | Transition roles, excluded roles, direct/adjacent/transition/unrelated | `matching/career`, settings | |
| Deep assessment | Search review; resume advice (`job-insights`); interview prep route | Per-job fit assessment | dialog | `lib/ai/deep-assessment`, `/api/job-assessment` |
| Analytics | Feedback events, `CareerIntelligence`, `MIN_FOR_RATE` | Funnel, score comparison, corrections, filters | `feedback` (optional fields) | `lib/analytics` |
| Providers | Fallback/all modes, 15 s timeout, error messages | Retry, pagination, per-provider status, health | `providers/`, `/api/status` (additive) | `providers/health` |

## Storage, API and third-party implications

* **Storage:** no Supabase migration. Every new field is optional in the Zod schemas and carried in the
  existing backup blob. New refine filters get defaults so saved filters still load.
* **API:** additive only. New routes `/api/job-check` (enrich and verify one job) and
  `/api/job-assessment`. `/api/status` keeps its three fields and stays free of outside calls.
* **Third party:** a new outbound fetch to employer and applicant-tracking pages, **off unless
  `JOB_PAGE_FETCH=1`**. Never Adzuna redirects or job boards; robots.txt honoured. No new dependency.

## Decisions

1. Enrichment and verification run **on demand when a job is opened**, not during search: the search route
   already spends up to 95 of its 120 seconds on the AI review.
2. Qualification checks do not move a job down the ranking unless the posting makes it mandatory, allows no
   equivalent, and the candidate's entered details contradict it. Empty means unknown.
3. Benchmark fixtures use invented candidates. A real profile is evaluated only locally from an exported
   backup, and that report is git-ignored. This repository is public.
4. Scoring weights are not tuned from the benchmark.
5. The deep assessment returns no score and cannot change eligibility.

## Stages

1 benchmark, 2 retrieval and verification, 3 qualifications and career alignment, 4 deep assessment,
5 analytics and providers, 6 interface, 7 validation and documentation. One commit or more per stage.
Nothing is pushed or deployed without authorization.
