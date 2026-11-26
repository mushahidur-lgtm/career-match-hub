# GitHub Actions and CI/CD

[Home](../README.md)

| Workflow | Trigger | Does | State observed 2026-11-26 |
| --- | --- | --- | --- |
| [ci.yml](../../.github/workflows/ci.yml): *Unit tests, lint, typecheck, build* | PRs, pushes to `main` | `npm ci`, test, lint, typecheck, build on Node 22 | Passing |
| ci.yml: *Browser smoke tests* | same | Build, Playwright; uploads report on failure | Passing |
| [codeql.yml](../../.github/workflows/codeql.yml) | PRs, `main`, weekly | JavaScript/TypeScript analysis; no manual trigger | Fails on PR 7 (one alert) |
| [dependency-review.yml](../../.github/workflows/dependency-review.yml) | PRs | Fails on new high or critical vulnerabilities; needs the dependency graph | Passing since the graph was enabled |
| [deployment-smoke.yml](../../.github/workflows/deployment-smoke.yml) | Successful production deployment status, or by hand | GET `/` and `/api/status` | **No runs found** |
| [daily-run.yml](../../.github/workflows/daily-run.yml) | 12:00, 13:00, 15:00 UTC, or by hand | Calls the morning run | Succeeds but exits early: secrets not set |

Run the smoke check by hand:

```bash
gh workflow run deployment-smoke.yml -f url=https://career-match-hub.vercel.app
```

## Dependency updates
[dependabot.yml](../../.github/dependabot.yml): weekly npm and Actions updates. Minor and patch npm updates are
grouped; majors come separately and need review (on 2026-11-26, a TypeScript 7 update failed the build and was
left open).

## Release practice
Branch, pull request, wait for checks, review the preview, merge. There are no version tags or release notes.
