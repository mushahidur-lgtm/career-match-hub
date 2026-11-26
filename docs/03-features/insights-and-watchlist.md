# Overview, career intelligence, history and watchlist

[Home](../README.md) · [Features](feature-overview.md)

## Overview dashboard
[Overview.tsx](../../src/components/Overview.tsx), [overview.ts](../../src/lib/overview.ts): top opportunities,
items needing attention and, with sync, the morning run card.

## Career intelligence
[CareerIntelligence.tsx](../../src/components/CareerIntelligence.tsx),
[intelligence.ts](../../src/lib/intelligence.ts): what your searches showed (skills asked for, roles, pay,
places) and your funnel. Rates appear only from 5 applications. It describes what you saw, not the market.

## Search history
[SearchHistory.tsx](../../src/components/SearchHistory.tsx), [history.ts](../../src/lib/history.ts): up to 500
searches and 1,500 seen jobs, compact (no descriptions); trimmed when storage is full.

## Feedback events
[feedback.ts](../../src/lib/feedback.ts): viewed, saved, application started and submitted, interview,
rejected, offer, marked irrelevant, skill or eligibility corrected. Capped at 1,000, kept in backups and sync.
Nothing changes weights.

**[PR 7]** an outcomes panel
([FeedbackAnalytics.tsx](../../src/components/FeedbackAnalytics.tsx) **[PR 7]**,
[feedback-analytics.ts](../../src/lib/analytics/feedback-analytics.ts) **[PR 7]**): reviewed, saved, applied, conversion
rates, average scores, common missing skills, corrections, by category and period. It only states whether there
is enough history (30 applications, 8 interviews) to compare by hand; it proposes no weights.

## Career-site watchlist
[Watchlist.tsx](../../src/components/Watchlist.tsx), [model.ts](../../src/lib/watchlist/model.ts): careers pages
you check yourself, with a check interval and reminders. The app does not fetch them. Suggested sites carry the
date they were verified and should be confirmed by opening them.

## Limitations
All figures are local to one browser's history (or its synced copy).
