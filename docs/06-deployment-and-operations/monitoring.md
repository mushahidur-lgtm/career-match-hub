# Monitoring and logging

[Home](../README.md)

## What exists
* Vercel build and function logs (`console.error` lines only).
* `/api/status` for configuration; **[PR 7]** observed job-source health per server instance.
* GitHub Actions and CodeQL results.

## What does not exist
No error tracking, metrics, uptime monitor, alerting or analytics was found in the repository.

## Where to look
| Symptom | Look at |
| --- | --- |
| Search returns nothing | Warnings in the UI; Vercel logs for "search failed" |
| AI buttons fail | Logs for the route name; Anthropic console for errors and spend |
| Morning run missing | The Actions run log (it prints the HTTP response) |
| Build fails | Vercel build log, CI job log |

## Suggestions (not implemented)
An external uptime check on `/api/status`; error tracking with resume text excluded; spend alerts on the
Anthropic and RapidAPI accounts.
