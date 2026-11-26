# Career Match Hub Wiki

Career Match Hub matches your resume to live job postings, explains each score, and tracks your applications.
Your data stays in your browser unless you turn on cloud sync.

* Live application: <https://career-match-hub.vercel.app/>
* Repository: <https://github.com/mushahidur-lgtm/career-match-hub>

## Read this first: what is in production

These pages describe the code in this checkout. Production deploys from `main`.

| Marker | Meaning |
| --- | --- |
| (no marker) | On `main` and therefore in production |
| **[PR 7]** | In [pull request 7](https://github.com/mushahidur-lgtm/career-match-hub/pull/7), **not merged, not in production** (state on 2026-11-26) |

When PR 7 merges, remove the **[PR 7]** markers. The production site has no Anthropic key
(`/api/status` returned `"ai": false` on 2026-11-26), so every AI feature is currently off there.

## Quick start

```bash
git clone https://github.com/mushahidur-lgtm/career-match-hub.git
cd career-match-hub
npm install
npm run dev
```

Open <http://localhost:3000>. With no keys the dev server shows labelled sample jobs.
Details: [Local development](01-getting-started/local-development.md).

## Technology

| Area | Choice (from `package.json`) |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5, strict |
| Styling | Tailwind CSS 4 |
| Validation | Zod 4 |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) |
| Optional cloud | Supabase |
| Resume files | `pdf-parse`, `mammoth` |
| Tests | Vitest 5, Playwright |
| Hosting | Vercel |

## Contents

| Section | Pages |
| --- | --- |
| Getting started | [Overview](01-getting-started/overview.md) · [Local development](01-getting-started/local-development.md) · [Environment variables](01-getting-started/environment-variables.md) |
| Architecture | [System](02-architecture/system-architecture.md) · [Data and storage flow](02-architecture/data-flow.md) · [Integrations](02-architecture/integrations.md) · [Decisions](02-architecture/architecture-decisions.md) |
| Features | [Index](03-features/feature-overview.md) · [Job search](03-features/job-search.md) · [Job matching](03-features/job-matching.md) · [Opening a job](03-features/job-detail.md) · [Resumes](03-features/resume-management.md) · [Applications](03-features/application-tracking.md) · [HR and Recruiter Finder](03-features/recruiter-finder.md) · [Insights and watchlist](03-features/insights-and-watchlist.md) · [Settings, backup, sync](03-features/settings-backup-sync.md) |
| Technical reference | [API](04-technical-reference/api-reference.md) · [Data models and database](04-technical-reference/data-models.md) · [Authentication and authorization](04-technical-reference/authentication.md) · [Error handling](04-technical-reference/error-handling.md) |
| AI and matching | [Matching algorithm](05-ai-and-matching/matching-algorithm.md) · [AI features and prompts](05-ai-and-matching/ai-features.md) |
| Deployment and operations | [Deployment and rollback](06-deployment-and-operations/deployment.md) · [CI/CD](06-deployment-and-operations/ci-cd.md) · [Monitoring](06-deployment-and-operations/monitoring.md) |
| Security | [Overview](07-security/security-overview.md) · [SSRF protection](07-security/ssrf-protection.md) · [Findings and known risks](07-security/known-risks.md) |
| Development | [Conventions and contributing](08-development/conventions.md) · [Testing](08-development/testing.md) · [Debugging](08-development/debugging.md) |
| Troubleshooting | [Common issues and FAQ](09-troubleshooting/common-issues.md) |
| Roadmap | [Capabilities and limitations](10-roadmap/capabilities-and-limitations.md) · [Technical debt and ideas](10-roadmap/technical-debt-and-ideas.md) |
| Claude Code prompts | [Prompt library](11-claude-prompts/README.md) |
| About these docs | [Completeness report](documentation-report.md) · [Publishing to GitHub Wiki](GITHUB-WIKI-SETUP.md) |

### Earlier engineering records

Point-in-time design and audit notes, kept as history. Where they differ from the pages above, trust the code,
then the pages above.

[Matching engine v2](matching-engine-v2.md) · [Phase 2 plan](phase2-plan.md) **[PR 7]** · [Phase 2 report](phase2-report.md) **[PR 7]** ·
[Page reader security audit](security-page-reader.md) **[PR 7]** · [Benchmark](benchmark-report.md) **[PR 7]** ([baseline](benchmark-baseline.md))
