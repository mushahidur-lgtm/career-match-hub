# Testing and quality assurance

[Home](../README.md)

## Tools
Vitest ([vitest.config.mts](../../vitest.config.mts): Node environment, `server-only` stubbed), Playwright
([playwright.config.ts](../../playwright.config.ts): production build, keys blanked), ESLint, `tsc`, CodeQL.

Result on the PR 7 branch, 2026-11-26: **836 passed, 1 skipped** across 41 files; Playwright **7 passed**;
`main` has fewer tests. **Code coverage is not measured**: no coverage tool is configured.

```bash
npm test
npx vitest run tests/matching.test.ts      # one file
npm run lint && npm run typecheck && npm run build
npm run test:e2e
```

(In PowerShell run the chained commands one at a time or use `&&` in PowerShell 7.)

## Matrix
"Current coverage" counts test cases; it is not a coverage percentage.

| Area | Type | Location (`tests/`) | Command | Current coverage |
| --- | --- | --- | --- | --- |
| Matching | unit, scenarios | `matching`, `scenarios`, `engine-comparison` | `npm test` | 54 + 49 + 1 |
| Eligibility, qualifications **[PR 7]** | unit | `scenarios`, `qualifications` | `npm test` | 18 in `qualifications` |
| Search pipeline, providers | integration with mocked fetch | `providers`, `search-pipeline`, `search-ai`, `analytics-providers` **[PR 7]** | `npm test` | 13, 11, 4, 15 |
| API routes | API | `api`, `job-insights-api`, `find-recruiter`, `job-check` **[PR 7]**, `deep-assessment` **[PR 7]** | `npm test` | 11, 5, 19, 34, 11 |
| Resume | unit | `ai-profile`, `analysis`, `resume-sections`, `resume-help` | `npm test` | 16, 11, 26, 24 |
| Applications, storage, backup | unit, migration | `applications`, `saved`, `storage`, `migration-v4`, `backup`, `cloud` | `npm test` | 39, 14, 20, 13, 19, 33 |
| Recruiter finder | unit | `contacts`, `free-recruiter`, `networking`, `web-search`, `eval` | `npm test` | 62, 56, 20, 6, 16 |
| Security | security | `page-reader-security` **[PR 7]**, `hardening` | `npm test` | 21, 22 |
| Browser | end to end | [e2e/smoke.spec.ts](../../e2e/smoke.spec.ts) | `npm run test:e2e` | 7 |
| Benchmark **[PR 7]** | evaluation | `benchmark`, `tests/fixtures/benchmark/` | `npm run benchmark` | 37 scenarios |

## Not covered by automated tests
* React components (no component tests). The seven browser tests cover startup, the no-job-source message and
  the recruiter finder. Search results, the job dialog, settings, the resume editor and analytics screens are
  untested in the browser.
* Live behaviour of Anthropic, Adzuna, JSearch, Supabase (all mocked) and the SQL policies.
* `parse-resume` with real PDF and DOCX content beyond rejection cases was not verified here.

## Benchmark [PR 7]
`npm run benchmark` rewrites [benchmark-report.md](../benchmark-report.md). With
`npm run benchmark -- --backup <file>` it scores your profile into the git-ignored `benchmark-output/`. Figures
measure agreement with hand-written labels, not production performance.

## Rules
Every test must run without network or keys. Do not weaken a test to make a build pass; if behaviour changes on
purpose, say why in the commit.
