# Documentation completeness report

[Home](README.md)

Written 2026-11-26 against the code on `feat/phase2-job-intelligence` (`63f30d0`, pull request 7). Only
documentation changed: no source code, tests, configuration, settings or alerts.

## Documents created

| Area | Pages |
| --- | ---: |
| Home, wiki setup, this report, root `WIKI.md` | 4 |
| Getting started | 3 |
| Architecture | 4 |
| Features | 9 |
| Technical reference | 4 |
| AI and matching | 2 |
| Deployment and operations | 3 |
| Security | 3 |
| Development | 3 |
| Troubleshooting | 1 |
| Roadmap | 2 |
| Claude Code prompts (index and 13 categories) | 14 |
| **Total new Markdown files** | **52** |

The root `README.md` gained a link to the wiki, and its "six weighted parts" was corrected to seven. Pages that the requested outline listed separately were merged
where separate pages would have repeated each other: prerequisites and installation into local development;
frontend and backend into system architecture; Recruiter Finder and HR Recruiter Finder (one feature in the
code); authentication with authorization; database schema with data models; the AI pages into two; secrets,
input validation, API and authentication security into the security overview.

## Repository areas inspected
`src/app` (page and all route handlers), `src/components`, `src/lib` (matching, providers, eligibility, jobs,
net, ai, cloud, contacts, watchlist, storage), `src/types`, `tests`, `e2e`, `.github`, `supabase`, `scripts`,
`package.json`, `next.config.ts`, `playwright.config.ts`, `README.md`, `.env.example`. Live checks: GitHub
workflow runs, code scanning alerts, repository security settings, `/api/status` and response headers.

Depth varies: route contracts and security paths were read closely; several library modules (contacts,
watchlist, applications, overview, intelligence) were surveyed from their exports, header comments, tests and
the README rather than line by line.

## Features documented
Job search and filtering, matching, job detail tools, resumes, applications and interviews, HR and Recruiter
Finder, overview, intelligence, history, watchlist, feedback, settings, backup, cloud sync, morning run.

## Diagrams
11 Mermaid diagrams: system, request lifecycle, resume processing, job search, authentication, matching,
recruiter discovery, morning run, deployment, database, page reader.

## Claude prompts
64 prompts in 13 categories, all under `11-claude-prompts/`.

## Validation performed
* Relative links and section anchors: checked by script, none broken **against this checkout**.
* **Against `main`, 30 links in 11 pages would break** (23 distinct targets): they point at files that exist
  only in pull request 7. Publish these pages with or after PR 7, or remove those links first.
* Source file references: every linked path exists in this checkout.
* **[PR 7]** markers: checked by script for lines naming files, routes or variables that PR 7 adds. The check
  cannot see changed behaviour in files that already exist on `main`, so some such differences may be unmarked.
* Mermaid: structural check only (diagram type, balanced brackets and quotes). **Not rendered.**
* Secrets and personal data: pattern search found none.
* Empty or placeholder pages: none. `WIKI.md` is intentionally a short pointer.
* Duplicated text: no identical long paragraphs among the new pages (the two benchmark records share text by
  design). This does not detect contradictions in different wording.
* Tests were not changed or re-run for this documentation; test figures are from the same day's run on the
  same code.

## Missing or unverified information
* Vercel project settings, plan limits and domain configuration (not stored in the repository).
* Supabase configuration and whether any project is connected.
* Rollback was not exercised.
* AI cost, recruiter search hit rate, and behaviour against every live service.
* Code coverage (no tool configured).

## Limitations of these documents
* They describe an unmerged branch; **[PR 7]** markers must be removed or revised when it merges, closes or
  changes.
* Line-level details (limits, defaults, counts) will drift; dated observations are marked.
* Earlier engineering records in `docs/` are history and may disagree in detail.

## Recommended updates
1. After PR 7 is resolved: remove markers, update alert status and production notes.
2. Render every diagram on GitHub once and fix any that fail.
3. Re-check dated observations (workflows, secrets, headers, alerts) before relying on them.
4. Add a "docs updated?" line to the pull request template.

## Before committing or publishing
The repository is public, and [known risks](07-security/known-risks.md) lists open weaknesses, some present in
production. Committing these pages publishes that list. Decide whether to fix first, move that page elsewhere,
or accept it.
