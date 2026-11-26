# Prerequisites, installation and local development

[Home](../README.md)

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 20.16 or newer (`engines` in [package.json](../../package.json)); CI uses 22 |
| npm | the one shipped with Node; the repository has a `package-lock.json` |
| Git | any recent version |
| A Chromium browser | only for smoke tests |

No database, container or account is needed to run the app.

## From a clean machine

```bash
git clone https://github.com/mushahidur-lgtm/career-match-hub.git
cd career-match-hub
npm ci
cp .env.example .env.local      # optional; see environment-variables.md
npm run dev                     # http://localhost:3000
```

In Windows PowerShell use `Copy-Item .env.example .env.local`.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server (sample jobs appear if no job key is set) |
| `npm run build` | Production build |
| `npm run start` | Serves the build |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:e2e:install` | Installs Chromium for Playwright (downloads a browser) |
| `npm run test:e2e` | Smoke tests; run `npm run build` first; uses port 3100 |
| `npm run eval:recruiters` | Measures recruiter search on jobs you list; costs money; needs a running site and key |
| `npm run benchmark` **[PR 7]** | Matching benchmark; see [testing](../08-development/testing.md) |

## Next.js note

[AGENTS.md](../../AGENTS.md) warns that this Next.js version differs from older ones. Read the guides in
`node_modules/next/dist/docs/` before changing routing or configuration. `next dev` may rewrite that block in
`AGENTS.md`.

## Checking your setup

* `GET http://localhost:3000/api/status` shows which features are on (never key values).
* With no keys: the banner says no live source is connected and sample jobs are labelled.

Problems: [Debugging](../08-development/debugging.md) · [Common issues](../09-troubleshooting/common-issues.md)
