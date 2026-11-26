# Phase 2 report: matching quality, job intelligence and validation

Branch `feat/phase2-job-intelligence`, from `main` at `0a240a8`. **Not pushed, merged or deployed.**

## 1. Summary

* A matching benchmark (37 labelled scenarios) with metrics and a report.
* On opening a job: fuller description where permitted, a posting check that separates closed from
  inaccessible, and an optional deep assessment with checked quotes.
* Degree and certificate requirements, transition and excluded roles.
* Outcome analytics, one retry and partial results for job sources, source health.
* Two pre-existing bugs fixed: "GTA" never widened the Adzuna search (literal backspace characters in the
  pattern), and "not remote" was read as remote.

## 2. Architecture

The Phase 1 engine is unchanged as the only scorer; weights and the AI bound were not touched.

| New | Role |
| --- | --- |
| `lib/benchmark/` | evaluate, metrics, report |
| `lib/net/safe-fetch`, `robots` | the only outbound page reader (SSRF guard, pinned address) |
| `lib/jobs/{job-page,jsonld,enrich,verify,check,apply-check,ttl-cache}` | enrichment and verification |
| `lib/eligibility/qualifications` | degree and certificate gates |
| `lib/assessment/`, `lib/ai/deep-assessment` | on-demand assessment |
| `lib/analytics/` | feedback analytics |
| `lib/providers/health` | observed source health |
| `/api/job-check`, `/api/job-assessment` | new routes |
| `PostingPanel`, `DeepAssessment`, `FeedbackAnalytics` | new UI |

Changed: `matching/engine`, `matching/career`, `eligibility/engine`, providers, schemas, types, refine,
settings, profile editor, job card and dialog. Full list: `git diff --stat 0a240a8`.

**Storage.** No migration. All fields optional; old filters, profiles, preferences and events still load.
An older build reading data written by this one would drop or reject the new fields.

**API compatibility.** Additive. Behaviour that differs: a job with an unmet explicit degree or certificate
now ranks with "needs verification" (or is excluded if you declared your list complete), and a provider
request that fails with a server error is tried twice.

## 3. Benchmark

Two invented candidates. Labels were committed before the engine was first run on them
(commit `94c4bcd`). Baseline: `benchmark-baseline.md`; current: `benchmark-report.md`.

| Metric | Baseline | Now |
| --- | ---: | ---: |
| Precision@5 | 60% | 70% |
| Precision@10 (ceiling 35%) | 35% | 35% |
| Recall of "apply" jobs | 100% | 100% |
| Ranking consistency | 88% | 79% |
| False-positive rate | 6% | 6% |
| False-negative rate | 0% | 0% |
| Tier agreement | 68% | 76% |
| Required-skill extraction precision / recall | 90 / 100% | 90 / 100% |
| Eligibility status accuracy | 86% | 100% |
| Evidence level accuracy | 100% | 100% |
| Missing qualifications reported | 0/4 | 4/4 |

Read these with care:

* **The eligibility and qualification figures are not independent evidence.** The rules were written knowing
  those labels.
* Ranking consistency fell only because four jobs now sit in "verify first", below every clear job. Ordered
  by score alone it is unchanged (189/215).
* A 37-case invented set says nothing about live performance or hiring.

**Still rated too kindly** (not tuned, by design): senior and director roles and off-city on-site roles show
as "consider" rather than "no"; a junior role scored 80 for a mid-level candidate; a Tableau role scored 85
for a Power BI candidate; study-only DevOps and data roles show as "consider".

**Candidate-specific benchmark:** not run on your profile. It lives in your browser. Export a backup and run
`npm run benchmark -- --backup <file.json>`.

## 4. Before and after

| Case | Before | After |
| --- | --- | --- |
| "Master's degree required", you hold a bachelor's | not mentioned, 93, strong | needs verification, both sides quoted |
| "Active AZ-204 required", none listed | not mentioned, 96, strong | needs verification; excluded only if your list is declared complete |
| "Bachelor's or equivalent experience", diploma and 8 years | no condition read | eligible, counted as equivalent experience |
| Required skill covered only by a related one | could be "strongly recommend" | listed as missing; at most "apply after gaps" |

## 5. Deep assessment example

Without Claude (as run locally): recommendation from the rules, rule score and confidence, required skills
matched and missing, related skills with the reason, study-only and listed skills, qualification checks,
and a message that Claude is not connected.

**No example with Claude is given: no live call was made.** The shape is validated against mocks in
`tests/deep-assessment.test.ts`.

## 6. Retrieval and verification

See the README. Enrichment runs only when you check a job, so **search-time scoring still reads Adzuna's
cut-off text**. For listings whose apply link is an Adzuna redirect (most Adzuna results), no employer page
is available and nothing improves. JSearch listings benefit most.

## 7. Analytics

Reviewed, saved, applied, interview and offer rates (from 5 applications), average scores, common missing
skills, corrections, by category and period. Weight changes are **not** proposed: the screen only says
whether there is enough history (30 applications and 8 interviews) to compare by hand.

## 8. Environment variables added

`JOB_PAGE_FETCH` (off), `JOB_CACHE_HOURS` (24), `ADZUNA_PAGES` (1). Existing: `ANTHROPIC_API_KEY` enables the
assessment, `RAPIDAPI_KEY` the JSearch detail lookup. No new dependency.

## 9. Deployment

Merging to `main` deploys through Vercel. Before merging: open a pull request and let CI run. After: the smoke
check reads `/` and `/api/status`; the three fields it checks are unchanged. Leave `JOB_PAGE_FETCH` unset until
you want page reads. Roll back from Vercel's deployment list.

## 10. Known limitations

* No live Claude, Adzuna, JSearch, Supabase or employer-page request was made. All are mocked.
* Verification covers a page's structured data and wording. Sites that render with JavaScript will often be
  "partially verified" or "not verified".
* Qualification reading is English pattern matching with a fixed list of certificates; others are flagged as
  unidentified.
* Caches, rate limits and source health are per server instance.
* Posting checks on saved applications update only when opened from a job card.
* A posting check re-scores with rules only; an earlier Claude adjustment is dropped.
* The morning run does not check postings.

## 11. Validation output (final code)

```
vitest run            Test Files  40 passed (40)   Tests  811 passed | 1 skipped (812)   (the skipped one needs --backup)
tsc --noEmit          exit 0
eslint                exit 0
next build            Compiled successfully
                      static: / and /_not-found
                      dynamic: /api/analyze-resume, cron/daily, find-recruiter, interview-prep, job-assessment,
                      job-check, job-insights, networking-draft, parse-resume, search-jobs, status
playwright test       7 passed
```

## 12. Next

1. Run the benchmark on your profile and label 20 real postings you have judged yourself.
2. Decide whether location and seniority conflicts should read as "not recommended".
3. Try `JOB_PAGE_FETCH=1` on a preview deployment and see how often it helps.
4. Add a JSearch key for fuller descriptions at search time.
