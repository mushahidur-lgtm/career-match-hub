# Feature index

[Home](../README.md)

The navigation tabs come from [AppShell.tsx](../../src/components/AppShell.tsx).

| Feature | Page | Main UI | Main tests |
| --- | --- | --- | --- |
| Job discovery, search and filtering | [Job search](job-search.md) | `SearchFilters`, `ResultFilters`, `JobCard` | `providers`, `filters`, `refine`, `search-pipeline` |
| Matching and scoring | [Job matching](job-matching.md) | `MatchBreakdown`, `match-v2` | `matching`, `scenarios` |
| Job details, suggestions, **[PR 7]** posting check and assessment | [Opening a job](job-detail.md) | `JobDetailDialog` | `job-insights-api`, `job-check`, `deep-assessment` |
| Resume upload, parsing, versions, profile | [Resumes](resume-management.md) | `ResumeManager` | `api`, `ai-profile`, `resume-sections` |
| Applications, interviews, reminders | [Applications](application-tracking.md) | `ApplicationsPage`, `InterviewTracker` | `applications`, `saved` |
| HR and Recruiter Finder (one feature; also called Recruiter Finder) | [Recruiter finder](recruiter-finder.md) | `components/contacts/*` | `contacts`, `find-recruiter`, `free-recruiter`, `networking` |
| Overview dashboard, career intelligence, search history, watchlist | [Insights and watchlist](insights-and-watchlist.md) | `Overview`, `CareerIntelligence`, `SearchHistory`, `Watchlist` | `overview`, `intelligence`, `watchlist` |
| Settings, backup, cloud sync, morning run | [Settings, backup, sync](settings-backup-sync.md) | `SettingsPanel`, `AccountPanel`, `DailyRunCard` | `backup`, `cloud`, `storage` |

Authentication: only cloud sync and some routes use sign-in; see [authentication](../04-technical-reference/authentication.md).
