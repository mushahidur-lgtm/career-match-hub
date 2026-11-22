# Contributing to Career Match Hub

Thanks for helping. This project handles resumes and recruiter details, so the rules below put privacy and honesty first.

## Principles

- **Never invent data.** No made-up jobs, contacts, emails, phone numbers or profile addresses in the product. Sample data exists only in development and is labelled.
- **Free mode must stay useful.** Every feature that uses an optional service (Claude, Supabase, a job board) must still behave sensibly without it.
- **No automatic outside lookups of people.** Do not add code that opens, scrapes or reads LinkedIn or people-search sites. Search links are plain links the user opens.
- **Do not change product behaviour in a repository or delivery change** unless a test, observability or deployment-safety need requires it, and say so in the pull request.

## Branch naming

Branch from `main` and use a short prefix:

| Prefix | For |
| --- | --- |
| `feature/` | New behaviour, for example `feature/recruiter-free-mode` |
| `fix/` | Bug fixes, for example `fix/phone-attribution` |
| `docs/` | Documentation only |
| `ci/` | Workflows, tooling, dependencies |
| `chore/` | Anything else that is not product behaviour |

## Validate locally before you push

You need Node.js 20.16 or newer (CI uses Node 22).

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e:install   # once
npm run test:e2e           # needs the build above
```

`PW_CHANNEL=chrome npm run test:e2e` (or `msedge`) uses a browser you already have. The smoke tests run the production build with every optional key blanked and block all outside network requests. If one fails with "tried to reach an outside host", your change added a network call.

## Pull requests

- Keep each pull request to one purpose and fill in the template.
- Add or update tests for what you change. Extraction and verification logic needs a false-positive test as well as a positive one.
- CI must pass: **Unit tests, lint, typecheck, build** and **Browser smoke tests**. CodeQL and dependency review should pass too.
- Describe user-visible changes in the pull request and update the README when behaviour, configuration or privacy boundaries change.
- Do not include resumes, real recruiter names, emails or phone numbers, screenshots of real data, or live URLs with tokens, in the pull request, tests or fixtures. Invent names and use `example` domains.

## Handling secrets safely

- **Never commit a secret.** That includes `.env.local`, API keys, `CRON_SECRET`, the Supabase service-role key and anything copied from a deployment dashboard. `.env.example` lists names only.
- Anything named `NEXT_PUBLIC_` is sent to every browser. Never give a secret that name.
- Use repository or Vercel environment variables for secrets. CI needs none, so do not add a secret to a workflow to make a test pass: mock the call instead.
- Do not print environment variables, request bodies, resume text or recruiter details in logs, workflow output or test output.
- Never paste a key into an issue, pull request, chat or screenshot. **If one is exposed, treat it as compromised:** revoke or regenerate it at the provider first, then update the deployment.
- Report a vulnerability privately, using the repository's Security tab ("Report a vulnerability"), not a public issue.

## Tests that call outside services

Tests must not call Anthropic, Adzuna, JSearch, LinkedIn or any people-search service. Unit tests mock the SDK and `fetch`. Browser tests mock the app's own routes and abort every request to another host.

## Repository settings

Branch protection and required checks are repository settings. A maintainer can enable them under Settings, Branches, by requiring the two CI checks above before merging into `main`. The files in this repository do not turn that on.
