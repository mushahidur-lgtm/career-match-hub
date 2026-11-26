# Claude Code prompts: UI and UX improvements

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Review usability](#1-review-usability)
- [Improve responsive design](#2-improve-responsive-design)
- [Improve accessibility](#3-improve-accessibility)
- [Improve navigation](#4-improve-navigation)
- [Improve dashboards](#5-improve-dashboards)

## 1. Review usability

**Prompt name:** Review usability  
**Purpose:** Find friction.  
**When to use:** Before UI work.  
**Expected outcome:** Prioritised issues with screenshots described.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Review the usability of [FEATURE_NAME] in the running app using invented data.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 2. Improve responsive design

**Prompt name:** Improve responsive design  
**Purpose:** Work on small screens.  
**When to use:** Layout breaks.  
**Expected outcome:** Fixes verified at several widths.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Fix responsive problems in [FILE_OR_DIRECTORY] and check 375 px, 768 px and desktop.

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

## 3. Improve accessibility

**Prompt name:** Improve accessibility  
**Purpose:** Meet WCAG 2.1 AA.  
**When to use:** Audits or releases.  
**Expected outcome:** Fixed issues with evidence.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Audit [FEATURE_NAME] for labels, focus order, contrast, keyboard use and screen-reader text, then fix.

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

## 4. Improve navigation

**Prompt name:** Improve navigation  
**Purpose:** Make things findable.  
**When to use:** Users get lost.  
**Expected outcome:** A small, consistent change.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Improve how users reach [FEATURE_NAME] without redesigning unrelated pages.

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

## 5. Improve dashboards

**Prompt name:** Improve dashboards  
**Purpose:** Make figures honest and readable.  
**When to use:** Charts confuse.  
**Expected outcome:** Clearer figures with sample-size notes.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Improve [DASHBOARD]. Show no rate below the sample thresholds in the code and invent no data.

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
