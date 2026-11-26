# Technical debt and future enhancements

[Home](../README.md)

**Everything on this page is a recommendation, not existing behaviour.**

## Technical debt
| Item | Where |
| --- | --- |
| Very large client page holding most state | [page.tsx](../../src/app/page.tsx) |
| Large dialog component | [JobDetailDialog.tsx](../../src/components/JobDetailDialog.tsx) |
| Eligibility and qualification reading by regular expressions | [eligibility/](../../src/lib/eligibility) |
| Inconsistent error logging | API routes |
| Documentation of matching spread over README, engineering notes and wiki | `README.md`, `docs/` |
| TypeScript 7, ESLint 10 and `@types/node` updates pending | Dependabot PRs |

## Suggested order of work
1. Decide on PR 7 (it fixes two stall risks that are in production).
2. Require sign-in or platform protection for routes that spend money.
3. Turn on branch protection; confirm the smoke check runs.
4. Add security headers.
5. Label real postings and calibrate matching.
6. Component or browser tests for search, job dialog and settings.

## Enhancements
Fuller descriptions at search time (JSearch); calendar export; notifications; OCR; a hard "not recommended"
for clear location or seniority conflicts.
