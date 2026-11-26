# Claude Code prompts: Documentation maintenance

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Update docs after code changes](#1-update-docs-after-code-changes)
- [Synchronise API documentation](#2-synchronise-api-documentation)
- [Update architecture diagrams](#3-update-architecture-diagrams)
- [Find outdated information](#4-find-outdated-information)

## 1. Update docs after code changes

**Prompt name:** Update docs after code changes  
**Purpose:** Keep the wiki true.  
**When to use:** After a merge.  
**Expected outcome:** Updated pages and [PR] markers.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Compare [BASE_COMMIT]..HEAD with docs/ and update affected pages. Edit documentation only.

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

## 2. Synchronise API documentation

**Prompt name:** Synchronise API documentation  
**Purpose:** Match routes.  
**When to use:** Routes changed.  
**Expected outcome:** Accurate API reference.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Check docs/04-technical-reference/api-reference.md against every route and schema; fix differences.

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

## 3. Update architecture diagrams

**Prompt name:** Update architecture diagrams  
**Purpose:** Correct pictures.  
**When to use:** Structure changed.  
**Expected outcome:** Valid Mermaid that matches code.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Verify every Mermaid diagram in docs/ against the code and fix.

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

## 4. Find outdated information

**Prompt name:** Find outdated information  
**Purpose:** Audit the docs.  
**When to use:** Periodically.  
**Expected outcome:** A list of stale claims.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Find claims in docs/ and README.md that the code, workflows or live status no longer support, including dated observations.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```
