# Opening a job: details, suggestions, posting check, deep assessment

[Home](../README.md) · [Features](feature-overview.md)

[JobDetailDialog.tsx](../../src/components/JobDetailDialog.tsx) has the tabs **Overview, Job description,
Match analysis, Resume recommendations, Application** and **[PR 7]** **Deep assessment**.

## Resume recommendations (AI-generated advice)
Built-in advice from the match and your resume lines
([resume-help.ts](../../src/lib/resume-help.ts)); with a key, **Claude suggestions** via
`/api/job-insights`: rewordings, lines to put forward, honest framing of gaps, questions, a checklist. A
rewrite that adds a skill or number is discarded ([insights.ts](../../src/lib/insights.ts)). Cached for the
last 20 jobs.

## Interview preparation
From an application: practice questions via `/api/interview-prep`, with a rule-based set when no key is set
([interview-prep.ts](../../src/lib/interview-prep.ts)).

## Posting check **[PR 7]**
**Overview → Check this posting.**

| Step | Detail |
| --- | --- |
| Fuller description | JSearch detail endpoint; with `JOB_PAGE_FETCH=1`, pages on known job application systems (JSON-LD `JobPosting`, then main text containing the known opening) |
| Verification | verified active, partially verified, not verified, expired, closed, apply link unavailable, check failed |
| Description status | full, partially enriched, job board only, incomplete, retrieval failed, not attempted |
| Rule | A block, CAPTCHA, timeout or server error is "check failed", never "closed" |
| Effect | A closed or expired job is no longer recommended; rules re-score the new text |
| Code | [PostingPanel.tsx](../../src/components/PostingPanel.tsx), [job-check/route.ts](../../src/app/api/job-check/route.ts), [jobs/](../../src/lib/jobs) |
| Auth | Sign-in required only where [enforced](../04-technical-reference/authentication.md) |

Limitations: employers' own career sites are not read; JavaScript-rendered pages are often unverifiable;
an earlier Claude adjustment is dropped when the text changes; the check is in the job details dialog, not the
application dialog.

## Deep assessment **[PR 7]**
Runs only when pressed. Skills, qualifications and eligibility come from the rules; Claude adds experience,
duty-by-duty comparison, a recommendation and interview preparation. Quotes not found in the resume or posting
are removed; it gives no score and cannot change eligibility. Without a key the rule findings and a message are
shown. Code: [DeepAssessment.tsx](../../src/components/DeepAssessment.tsx),
[deep-assessment.ts](../../src/lib/ai/deep-assessment.ts), [assessment/](../../src/lib/assessment).
It has never been run against the live API.

## Errors
Both panels show loading, error and retry states.
