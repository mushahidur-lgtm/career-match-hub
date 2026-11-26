# Application and interview tracking

[Home](../README.md) · [Features](feature-overview.md)

## Overview
A small CRM for jobs you pursue, stored in the browser.

## Pipeline
Stages: New, Interested, Preparing Application, Applied, Interview, Offer. Outcomes: Rejected, Withdrawn,
Closed ([types](../../src/types/job.ts)). Older names (Saved, Interviewing) are still read.

## User workflow
Save a job (or add one by hand), move it along, record notes, dates, resume version used, recruiter, offer
details and interviews; reminders surface follow-ups and deadlines; export CSV.

## Implementation
[ApplicationsPage.tsx](../../src/components/ApplicationsPage.tsx),
[ApplicationDialog.tsx](../../src/components/ApplicationDialog.tsx),
[InterviewTracker.tsx](../../src/components/InterviewTracker.tsx),
[applications.ts](../../src/lib/applications.ts) (pure functions, activity history),
[limits.ts](../../src/lib/limits.ts) (field sizes),
[applications-load.ts](../../src/lib/applications-load.ts) (entry-by-entry loading).

Status changes also record feedback events used by [insights](insights-and-watchlist.md).

## Errors
A damaged entry is set aside and downloadable from Settings; a full browser store shows a banner saying
changes are not being saved.

## Limitations
No reminders outside the app (no email or push); one browser unless sync is on.

## Ideas
Calendar export for interviews and follow-ups.
