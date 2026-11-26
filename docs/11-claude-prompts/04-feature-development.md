# Claude Code prompts: Feature development

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Plan a feature](#1-plan-a-feature)
- [Implement a backend feature](#2-implement-a-backend-feature)
- [Implement a frontend feature](#3-implement-a-frontend-feature)
- [Add an API integration](#4-add-an-api-integration)
- [Add a data or database change](#5-add-a-data-or-database-change)

## 1. Plan a feature

**Prompt name:** Plan a feature  
**Purpose:** Design before code.  
**When to use:** A new idea.  
**Expected outcome:** A written plan with risks and tests.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Plan [FEATURE_NAME]: behaviour [EXPECTED_BEHAVIOUR], files to change, data and API impact, cost, privacy and tests. Write no code.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 2. Implement a backend feature

**Prompt name:** Implement a backend feature  
**Purpose:** Add server logic.  
**When to use:** The plan is approved.  
**Expected outcome:** Library code, route and tests.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Implement the server side of [FEATURE_NAME] with validation, rate limit, safe errors and a decision about sign-in.

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

## 3. Implement a frontend feature

**Prompt name:** Implement a frontend feature  
**Purpose:** Add UI.  
**When to use:** The data exists.  
**Expected outcome:** Components with all states.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Implement the UI for [FEATURE_NAME] in the existing design language with loading, empty, error and unavailable states and keyboard access.

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

## 4. Add an API integration

**Prompt name:** Add an API integration  
**Purpose:** Connect a service.  
**When to use:** A new provider or API.  
**Expected outcome:** A configured, mocked, documented integration.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Integrate [SERVICE_NAME] using its official API only. Handle missing keys, timeouts and rate limits, mock it in tests, and document variables and data sent.

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

## 5. Add a data or database change

**Prompt name:** Add a data or database change  
**Purpose:** Change stored data safely.  
**When to use:** A new field or table.  
**Expected outcome:** Compatible schema change.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Add [DATA_CHANGE]. Keep old browser data and backups loading; for Supabase write a new migration file and do not run it against any database.

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
