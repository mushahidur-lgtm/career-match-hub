---
name: Release check
about: Checklist before and after a production deployment
title: "[Release] "
labels: release
---

## Before deploying

- [ ] CI is green on `main`: unit tests, lint, typecheck, build, browser smoke tests
- [ ] CodeQL and dependency review show nothing new and serious
- [ ] README and `.env.example` match any new or changed environment variable (names only, no values)
- [ ] No secret was added to the repository, a workflow, or a log
- [ ] Environment variables are set in Vercel for the features you want. `NEXT_PUBLIC_` values were set **before** building

## After deploying

- [ ] The **Deployment smoke check** workflow passed (home page and `/api/status`)
- [ ] `/api/status` shows the expected features: `ai`, `jobProvider`, `recruiterWebSearch`
- [ ] A manual search and a Find Recruiter lookup behave as expected on the live site (this spends job-board quota and, if enabled, Anthropic credit)
- [ ] If recruiter web search is enabled: a spend limit is set in the Anthropic Console, and sign-in or Deployment Protection is on

## Notes
