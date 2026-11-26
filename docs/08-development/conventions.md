# Conventions, adding a feature, dependencies and contributing

[Home](../README.md) · Also [CONTRIBUTING.md](../../CONTRIBUTING.md), [PR template](../../.github/PULL_REQUEST_TEMPLATE.md)

## Coding standards (as practised)
* TypeScript strict; `@/` import alias; ESLint with Next's rules ([eslint.config.mjs](../../eslint.config.mjs)).
* Logic in `src/lib` as pure functions; routes and components stay thin.
* Server-only modules import `server-only`.
* Zod for anything untrusted.
* Comments explain *why*. Plain, honest UI wording.
* Never invent data: no guessed names, jobs, dates or experience.

## Naming and layout
Components `PascalCase.tsx`; library files `kebab-case.ts`; tests `tests/<area>.test.ts`; types in `src/types`.
Storage keys are `cmh:<name>`.

## Adding a feature
1. Read the relevant Next 16 docs ([AGENTS.md](../../AGENTS.md)).
2. Put types in `src/types`, schema in `schemas.ts` (**optional fields**, never narrower).
3. Write logic and tests in `src/lib` and `tests/`.
4. Add a route only if the server is needed: `rateLimit`, validate, safe errors, decide on
   [sign-in](../04-technical-reference/authentication.md).
5. Add UI with loading, empty, error and unavailable states.
6. Update `.env.example`, README and these docs.
7. New outside calls must be documented and mocked in tests.

## Dependencies
Add only when needed (the PR template and past work keep the list short). Commit `package-lock.json`. Check
`npm audit` and the dependency review result.

## Branches, commits, pull requests
Observed practice: a topic branch (`feat/...`), descriptive commit subjects with an explanatory body, one
purpose per pull request, the template's checklist, merge commits. No enforced commit format.
