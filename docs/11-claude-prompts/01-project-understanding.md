# Claude Code prompts: Project understanding

[Prompt library](README.md) · [Wiki home](../README.md)

## Contents

- [Understand the repository](#1-understand-the-repository)
- [Explain the architecture](#2-explain-the-architecture)
- [Trace a feature end to end](#3-trace-a-feature-end-to-end)
- [Explain API and authentication flows](#4-explain-api-and-authentication-flows)

## 1. Understand the repository

**Prompt name:** Understand the repository  
**Purpose:** Get a map of the codebase.  
**When to use:** First session, or after time away.  
**Expected outcome:** A short map of folders, features, data and integrations.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Explain this repository: purpose, folder layout, main features, where data is stored, outside services, and how to run and test it.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 2. Explain the architecture

**Prompt name:** Explain the architecture  
**Purpose:** Understand how the parts fit.  
**When to use:** Before a design decision.  
**Expected outcome:** Diagram and explanation tied to files.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Explain the frontend, route handlers, libraries and storage. Include a Mermaid diagram and note where docs/02-architecture differs from the code.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 3. Trace a feature end to end

**Prompt name:** Trace a feature end to end  
**Purpose:** Follow one feature from click to storage.  
**When to use:** Before changing a feature.  
**Expected outcome:** An ordered call path with files and failure points.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: Trace [FEATURE_NAME] from the UI through routes, libraries, outside services and storage. List error paths, tests and gaps.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```

## 4. Explain API and authentication flows

**Prompt name:** Explain API and authentication flows  
**Purpose:** Know who can call what.  
**When to use:** Before touching routes.  
**Expected outcome:** A table of routes, sign-in rules and limits.  
**Prompt:**

```text
Project: Career Match Hub (Next.js App Router, TypeScript, Zod, Vitest, Playwright). Start at docs/README.md and AGENTS.md.

Task: For every route under src/app/api, give method, request, response, sign-in requirement, rate limit and cost it can incur. Point out unprotected costly routes.

Rules:
1. Read the relevant code before answering; cite file paths and function names.
2. Describe what exists; mark anything you could not verify as unknown, and keep recommendations separate.
3. This is read-only: change no files, settings or services. If a change seems needed, propose it with the files affected and the tests it would need, and wait.
4. Say a test or build passed only if you ran it; quote the result.
5. Never print secrets or personal data.
Do not commit, push, merge, deploy or publish anything.

Security rule: do not disable or weaken any check, and do not dismiss, suppress or work around a scanner alert to get a passing build. If you think an alert is acceptable, explain why and leave the decision to me.
```
