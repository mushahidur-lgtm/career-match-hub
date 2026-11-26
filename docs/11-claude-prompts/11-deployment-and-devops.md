# Claude Code prompts: Deployment and DevOps

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Review the Vercel deployment](#1-review-the-vercel-deployment)
- [Review GitHub Actions](#2-review-github-actions)
- [Diagnose a failed build](#3-diagnose-a-failed-build)
- [Improve CI/CD](#4-improve-cicd)
- [Prepare a release](#5-prepare-a-release)

## 1. Review the Vercel deployment

**Prompt name:** Review the Vercel deployment  
**Purpose:** Check configuration.  
**When to use:** Before or after release.  
**Expected outcome:** Gaps and risks.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Review deployment settings visible in the repository and the live status endpoint. List what must be checked in the Vercel dashboard.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 2. Review GitHub Actions

**Prompt name:** Review GitHub Actions  
**Purpose:** Check workflows.  
**When to use:** CI changes.  
**Expected outcome:** Problems and least-privilege advice.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Review .github/workflows and recent runs, including whether each workflow actually does its job.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 3. Diagnose a failed build

**Prompt name:** Diagnose a failed build  
**Purpose:** Find the cause.  
**When to use:** CI or Vercel fails.  
**Expected outcome:** Cause and fix.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Diagnose this failure: [ERROR_MESSAGE] on [PR_NUMBER]. Read the logs, find the cause, then propose the fix.

Rules:
1. Inspect the existing implementation before changing anything.
2. Follow project conventions: logic in src/lib, thin routes and components, Zod for untrusted data, new stored fields optional, server-only for secrets.
3. Make no architectural change or new dependency that the task does not require.
4. List the files and dependencies affected.
5. Explain your plan before substantial changes and wait for my approval.
6. Add or update tests. Never delete or weaken a test to make it pass.
7. Run what applies: npm test, npm run typecheck, npm run lint, npm run build, and npm run test:e2e if UI or search behaviour changed.
8. Report changed files and what is still outstanding.
9. Do not say a check passed unless you ran it; quote the result.
10. Never print or commit secrets, resumes, backups or personal data: the repository is public.
Do not commit, push, merge or deploy without my approval. Merging to main deploys production.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 4. Improve CI/CD

**Prompt name:** Improve CI/CD  
**Purpose:** Stronger pipeline.  
**When to use:** Gaps found.  
**Expected outcome:** A staged proposal.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Propose CI/CD improvements. Change no repository or security settings.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 5. Prepare a release

**Prompt name:** Prepare a release  
**Purpose:** Ready a change for production.  
**When to use:** Before merging.  
**Expected outcome:** Checklist with results and rollback.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Prepare [BRANCH_NAME] for release: checks, preview verification, behaviour changes, environment variables and rollback.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```
