# Debugging

[Home](../README.md)

## First checks
1. `GET /api/status`: are the features you expect on?
2. Restart `npm run dev` after editing `.env.local`.
3. Browser console and network tab for the failing request's status and `error` message.
4. Server terminal for `... failed:` lines.

## Inspecting browser data
Developer tools → Application → Local Storage → keys starting `cmh:`. `cmh:recovered:*` holds data that failed
validation. Export a backup before editing anything; backups contain personal data.

## Scoring questions
Call `scoreJob` in a test with the posting and an invented profile; inspect `detail.components`,
`detail.caps`, `detail.skillEvidence`, `eligibility.checks`. Fixtures:
[matching-fixtures.ts](../../tests/fixtures/matching-fixtures.ts).

```bash
npx vitest run tests/scenarios.test.ts
```

## Provider problems
Mock `fetch` as in [search-pipeline.test.ts](../../tests/search-pipeline.test.ts) rather than spending quota.

## Windows notes
* A running `next start` keeps a native file locked and can make `npm ci` fail with `EPERM`: stop it first.
* Smoke tests need port 3100 free; set `$env:PW_CHANNEL = "msedge"` to use an installed browser.
