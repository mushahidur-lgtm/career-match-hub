# Job discovery, search and filtering

[Home](../README.md) · [Features](feature-overview.md)

## Overview
Searches job boards for a title and city, scores results against the active resume, and lists ineligible or
closed jobs separately.

## User workflow
1. **Discover jobs**: enter title, city, category, work mode, employment type, minimum salary; **Search jobs**.
2. Refine what came back (minimum score, salary, location, dates, status and more).
3. Sort by match, newest, salary or company; export CSV; open a job.

Searching without a resume lists jobs without scores. If the resume, skills or preferences change, a notice
offers to update the scores.

## Implementation

| Part | Source |
| --- | --- |
| Form and filters | [SearchFilters.tsx](../../src/components/SearchFilters.tsx), [ResultFilters.tsx](../../src/components/ResultFilters.tsx), [refine.ts](../../src/lib/refine.ts) |
| Route | [search-jobs/route.ts](../../src/app/api/search-jobs/route.ts) |
| Providers | [providers/](../../src/lib/providers): `fetchJobs`, `applyFilters`, `inferWorkMode`, `inferEmploymentType`, `inferCategory` |
| Duplicates | [dedupe.ts](../../src/lib/dedupe.ts): same employer, title and city; keeps the richest listing |
| Posting state | [jobs/status.ts](../../src/lib/jobs/status.ts) |
| Ranking | [search/rank.ts](../../src/lib/search/rank.ts): clear jobs, then "verify first"; ineligible or closed apart |
| Export | [export.ts](../../src/lib/export.ts) (formula characters neutralised) |

At most 60 ranked and 30 excluded jobs are returned. Filtering keeps jobs that do not state a value.
Salary is a filter, never part of the score; a board's estimated salary never excludes a job.

**[PR 7]** adds filters for strong matches, verified postings, eligibility, missing required skills and career
transitions, plus a line saying what each source returned.

## Configuration
A job key is required in production: see [environment variables](../01-getting-started/environment-variables.md#job-sources).

## Errors
Provider failures show as warnings above the results; the next source is tried. With no source, production
shows "No job source is connected". The route is limited to 12 requests per minute per client.

## Limitations
* Adzuna descriptions are cut short, so requirements are under-read.
* One page per Adzuna search by default; JSearch asks for two pages and the last month.
* Closed postings are detected only from text, a provider's closing date, or (**[PR 7]**) a posting check.

## Ideas (not implemented)
Saved searches with alerts; enrichment before ranking.
