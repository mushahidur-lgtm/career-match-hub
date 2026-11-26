# Claude Code prompts: Database and API

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Review data models](#1-review-data-models)
- [Review API contracts](#2-review-api-contracts)
- [Improve API error handling](#3-improve-api-error-handling)
- [Audit external integrations](#4-audit-external-integrations)
- [Review data validation](#5-review-data-validation)

## 1. Review data models

**Prompt name:** Review data models  
**Purpose:** Check types and schemas agree.  
**When to use:** Data changes.  
**Expected outcome:** Mismatches and migration risks.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Compare src/types with Zod schemas, backup, sync and the SQL migration.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 2. Review API contracts

**Prompt name:** Review API contracts  
**Purpose:** Protect callers.  
**When to use:** Before changing responses.  
**Expected outcome:** Contract and compatibility notes.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Document the contract of [ENDPOINT] and every caller, and what a change would break.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 3. Improve API error handling

**Prompt name:** Improve API error handling  
**Purpose:** Consistent failures.  
**When to use:** Confusing errors.  
**Expected outcome:** Safe, consistent errors with tests.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Improve error handling of [ENDPOINT] without leaking internals or logging resume text.

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

## 4. Audit external integrations

**Prompt name:** Audit external integrations  
**Purpose:** Check outside calls.  
**When to use:** Periodically.  
**Expected outcome:** Per-service risks.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Audit every outbound call: data sent, credentials, redirects, timeouts, retries and cost.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 5. Review data validation

**Prompt name:** Review data validation  
**Purpose:** Close gaps.  
**When to use:** New inputs.  
**Expected outcome:** Missing checks and limits.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Find inputs in [FILE_OR_DIRECTORY] without type, length or format limits.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```
