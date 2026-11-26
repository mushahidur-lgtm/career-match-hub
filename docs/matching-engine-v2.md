# Matching engine v2: hybrid deterministic + AI-assisted

Status: in progress on branch `feat/hybrid-matching-engine`. This document is the architecture
assessment, the phased plan and (at the end) the record of what changed.

## 1. Architecture assessment (baseline `8e8b101`)

| Area | What exists | Notes |
|---|---|---|
| Framework | Next.js 16.4 App Router, React 19, TS strict, Tailwind 4, Zod 4, Vitest 5, Playwright | `AGENTS.md`: Next 16 has breaking changes, read `node_modules/next/dist/docs` before touching routing |
| Storage | Browser `localStorage` via `usePersistentState`; optional Supabase sync of the whole backup blob (`user_data.data jsonb`) plus `daily_runs` | No relational job/match tables. Schema changes are JSON-shape changes validated by Zod in `lib/schemas.ts` / `lib/backup.ts` |
| Auth | Supabase auth (optional), RLS on both tables | Untouched |
| Providers | `lib/providers/{adzuna,jsearch,demo}.ts`, `fetchJobs()` tries Adzuna then JSearch (first success wins), demo only in dev | No provider interface; 15 s timeouts; `ProviderError` for 401/403/429 |
| Normalization / dedup | `stripHtml`, `infer*` in `providers/common.ts`; `lib/dedupe.ts` merges same employer+title+city, keeps richest listing, borrows full description | Does not prefer employer-hosted links |
| Posting quality | `lib/job-quality.ts`: `descriptionInfo` (full/partial/short), `applyLinkInfo` (employer / ATS / board / redirect), `likelyClosed` (age + "no longer accepting" text) | Display only; not part of the match result |
| Requirements | `matching/requirements.ts` `parseRequirements`: section headings + preference cues → required/preferred skills, required years, duties text, `structured` flag | Skills only; no education/certs/language/authorization/clearance |
| Engine | `matching/engine.ts` `scoreJob(job, input, overrides?)`: 6 weighted components (skills 30, experience 25, responsibilities 20, seniority 10, industry 5, location 10), canonical skills, family-based transferable credit, title similarity, seniority ladder, industry, location regions, salary reported not scored, 3-level confidence, caps (none matched 55, <half 65, off-role 60, seniority +3 55, location 69, thin 89), verified resume evidence, bounded AI overrides (±25 on experience/responsibilities) | Strong foundation. Gaps: a skill listed in a skills line counts as fully proven; no eligibility; no career alignment; transferable relations unexplained; confidence is label only |
| AI | `lib/anthropic.ts` `callStructured` (Zod output format, model fallback); search route sends top 15 to one Claude call returning experience/responsibility scores, evidence quotes, gaps, note | Already treats resume/postings as untrusted; quotes verified against resume |
| Search API | `POST /api/search-jobs` → `SearchResponse { jobs, mode, provider, scoring, warnings }`; also used by `lib/cloud/daily-run.ts` (rules only) | Rate-limited, Zod-validated |
| Tracking | Applications CRM with statuses and activity history; search history (`intel`) | No match-feedback events |
| UI | `JobCard`, `JobDetailDialog` (Match tab → `MatchBreakdown`), `ResultFilters` | |
| Tests | 30 files / 653 tests incl. `tests/matching.test.ts` (engine behaviours), `search-ai.test.ts` (AI bounding), `api.test.ts` | Baseline green: vitest 653/653, `tsc` 0 errors, `eslint` clean |

## 2. Design decisions

* **One engine.** `scoreJob` stays the single scorer. New concepts are modules it calls
  (`candidate/`, `eligibility/`, `jobs/`), not a parallel engine.
* **Contracts are additive.** `MatchResult.score` stays the number every screen sorts on and now equals
  `finalScore`. New fields (`deterministicScore`, `aiAdjustment`, `finalScore`, `eligibility`,
  `postingStatus`, `recommendedAction`, `strengths`, `gaps`, `careerAlignment`, `confidenceScore`, `ai`)
  are optional so stored results, backups and saved applications still validate.
  `SearchResponse` gains optional `excluded` and `ai` blocks; `jobs` keeps its meaning (recommendations).
* **Component keys are stable.** `industry` keeps its key (label becomes "Domain") and a new `career`
  key is added. Stored custom weights without `career` are read with the default.
* **AI is an adjustment, not a re-weighting.** The old ±25 per-component override path is retired from the
  route (kept in `scoreJob` for compatibility). Final = clamp(deterministic + clamp(ai, ±15)), then caps
  and eligibility are re-applied.
* **Candidate facts are explicit.** Work authorization, languages, clearance and exclusions are only ever
  taken from settings the user enters. Nothing is inferred from a resume.
* **Provider mode.** `JOB_PROVIDER_MODE=fallback` (default, today's behaviour and API quota) or `all`
  (query every configured provider in parallel, partial results, cross-provider dedup).

## 3. Phased plan

1. **Audit + baseline**: labelled anonymized fixtures (scenarios A–H), a baseline snapshot of the
   current engine's scores (`tests/fixtures/baseline-v1.json`), regression tests on behaviours to keep.
2. **Models**: Candidate Intelligence Profile with per-skill evidence levels; structured requirement
   extraction with importance, evidence text and confidence; `PostingStatus`.
3. **Eligibility + deterministic**: eligibility/language gates; evidence-level credit
   (100/70/40/25/0); explained transferable relations; responsibility and career-alignment scoring;
   new caps; weights 25/25/20/10/10/5/5; numeric confidence.
4. **AI evaluation**: schema-validated career-fit assessment, bounded ±15 adjustment, verified evidence,
   prompt-injection guard, cache, concurrency, timeouts, deterministic fallback.
5. **Search integration**: provider abstraction, posting status, ranking order
   (eligible → needs_verification → excluded section), AI shortlist (top 20).
6. **UI**: minimal additions to `MatchBreakdown`/`JobCard`/results list; feedback events.
7. **Validation**: vitest, tsc, eslint, `next build`, old-vs-new comparison on fixtures.

## 4. Risks and migration

| Risk | Mitigation |
|---|---|
| Scores drop for skills only listed in a skills line | Intended (methodology); shown as an explicit gap with the reason, and measured in the old-vs-new report |
| Stored data written by v1 | All new fields optional; schemas extended, never narrowed; backup version unchanged |
| AI cost growth (15 → 20 shortlisted) | Batches of 10 → 2 calls per search; cache by hashed key; `AI_SHORTLIST` env to tune |
| Sonnet 4.5 retirement (2026-11-30) | Existing `withModelFallback` logic reused |
| Prompt injection through postings | Postings sanitized (invisible characters, instruction-like lines flagged), wrapped as data, no tools, output schema-validated and bounded |
| Eligibility false negatives | Hard fail only with confirmed posting text AND an explicit candidate fact; otherwise `needs_verification` |
