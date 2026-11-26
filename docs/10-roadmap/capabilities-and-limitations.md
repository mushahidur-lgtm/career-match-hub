# Current capabilities and known limitations

[Home](../README.md)

## Capabilities

| Capability | In production | In PR 7 |
| --- | :---: | :---: |
| Resume upload, profile, versions | yes | yes |
| Search (Adzuna or JSearch), filters, export | yes | more filters |
| Hybrid matching, eligibility, excluded list | yes | + degrees, certificates |
| Claude review | code yes; **no key configured** | same |
| Applications, interviews, reminders | yes | yes |
| Recruiter finder, drafts | yes (web search off) | yes |
| Intelligence, history, watchlist, feedback capture | yes | + outcome analytics |
| Backup, sync, morning run | code yes; morning run not set up | yes |
| Posting check, deep assessment, source health, benchmark | no | yes |

## Known limitations
* Adzuna descriptions are partial, which weakens requirement and eligibility reading.
* English-only text matching; eligibility facts cover Canada.
* Scoring weights are uncalibrated; some seniority and location mismatches rate too kindly.
* No live testing of the AI paths, recruiter web search, **[PR 7]** posting checks.
* Per-instance caches and limits.
* No email or push notification, no multi-user support.
* No component tests or measured coverage.
