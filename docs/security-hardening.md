# Private, single-owner setup and security report

Written 2026-11-26 for branch `security/private-app`, taken from `main` at `0a240a8`. Nothing here has been deployed.

## Before you merge: do this first

Merging to `main` deploys to production. With these changes **every server feature is closed until sign-in is set
up**, so searching stops working if you merge first. Order: Supabase, then Vercel variables, then merge, then
Vercel protection, then the checks.

### 1. Supabase (free plan)

1. Create a project at supabase.com, or use yours.
2. **SQL Editor:** run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_owner_only.sql`.
3. **Authentication, Users, Add user:** your email and a long, unique password.
4. **Authentication, sign-in / providers settings:** turn **off** "Allow new users to sign up" and anonymous sign-ins.
   Turn off any provider you do not use.
5. **SQL Editor**, with your own email:
   ```sql
   insert into private.app_owner (user_id) select id from auth.users where email = 'you@example.com';
   ```
6. Run `supabase/tests/verify_access.sql` and compare each result with its comment. The last two blocks are meant to
   fail with "not allowed" and "permission denied"; run them one block at a time.
7. Copy the Project URL and anon key (**Project Settings, API**), and your account's **UID** from the Users page.

Supabase may pause an inactive free project; while it is paused, private features answer 503.

### 2. Vercel environment variables (Production and Preview)

| Variable | Needed | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public by design. Fixed at build time: redeploy after changing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public by design |
| `OWNER_USER_ID` | Yes | Your account's UID. Server only |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (or `RAPIDAPI_KEY`) | For live jobs | Server only |
| `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `DAILY_RUN_EMAILS` | Only for the morning run | Server only. Without the run, do not add the service key at all |
| `ANTHROPIC_API_KEY`, `AI_ENABLED`, `RECRUITER_WEB_SEARCH` | **No** | Remove them to pay nothing. A key without `AI_ENABLED=1` is ignored |

### 3. Vercel Deployment Protection

**Project, Settings, Deployment Protection:** method **Vercel Authentication**, scope **All Deployments**. That covers
the production address, preview addresses and generated deployment addresses. Vercel's documentation (page dated
2026-09-15) says All Deployments with Vercel Authentication is available on all plans without a paid add-on:
<https://vercel.com/docs/deployment-protection>. I have not seen your project's settings.

- Do not create shareable links or protection exceptions.
- Morning run only: create **Protection Bypass for Automation** (Vercel documents it as available on all plans) and
  store the value as the GitHub repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`. It also skips Vercel Firewall blocks. That value opens the whole site's outer door, so treat it as a password. The app's
  own sign-in still applies behind it.

### 4. Check it

- A private browser window on your site shows Vercel's sign-in, not the app.
- Signed in to Vercel but not to the app: the banner asks you to sign in and a search is refused.
- Sign in under **Settings, Cloud sync**: the banner shows your job source and a search works. Sync can stay off.
- GitHub, **Actions, Deployment smoke check**, run it with your site address.

## What was found

| # | Issue on `main` | Severity (my judgement) | Change |
| --- | --- | --- | --- |
| 1 | Search, resume analysis, resume upload, job suggestions, interview practice and status needed no sign-in | High | Every route except the morning run requires the owner |
| 2 | Sign-in checks passed when no database was configured | High | They now refuse |
| 3 | With `DAILY_RUN_EMAILS` empty, any account passed | High | Access is one account, `OWNER_USER_ID` |
| 4 | Database policies allowed any account its own rows; table privileges were Supabase's broad defaults | Medium | `0002`: owner-only restrictive policies, narrow grants, nothing for visitors |
| 5 | Rate limits lived in each server instance's memory | Medium | A second limit counted in the database; refused if it cannot be checked |
| 6 | Resume files were uploaded to the server | Medium (privacy) | Read in the browser; the upload route is removed |
| 7 | A small `.docx` could unpack to a very large size | Medium | Every entry is unpacked and counted before reading (10 MB each, 20 MB total, 500 parts) |
| 8 | Resume text was sent for analysis even with Claude off | Low | Sent only when Claude is on; otherwise analysed in the browser |
| 9 | Several routes logged error messages, which can quote input | Low | Only the error type and status are logged |
| 10 | No Content-Security-Policy or framing protection | Medium | Added with other headers; the API is not cached |
| 11 | Request bodies had no size limit of their own | Low | Capped per route, stopping while reading |
| 12 | A key alone enabled paid Claude calls | Medium (cost) | Also needs `AI_ENABLED=1`; web search needs a further switch |
| 13 | Provider requests carrying an API key followed redirects | Low | Redirects are refused for those requests |
| 14 | The cloud copy held contact details from the resume | Low (privacy) | Email addresses, phone numbers and LinkedIn addresses are removed before upload |

## How it works now

- **Sign-in:** the browser holds a Supabase session and sends its token in an `Authorization` header. The server asks
  Supabase who the token belongs to and compares that id with `OWNER_USER_ID`. No token: 401. Another account: 403.
  Configuration missing or wrong: 503. Nothing is read from the request before this.
- **CORS, CSRF, cookies:** the app sets no CORS headers, so other sites cannot read its responses, and it uses no
  cookies of its own, so another site cannot make your browser act for you. The only cookie is Vercel's, which Vercel
  manages. The trade-off: the session token is in `localStorage`, where a script injection could read it. Moving to
  HttpOnly cookies would be a separate redesign.
- **Morning run:** still `CRON_SECRET`, and it now runs only for the owner.

### Where personal data is

| Place | What | Notes |
| --- | --- | --- |
| Browser `localStorage` | Resume text and profile, applications, notes, contacts, history, cached suggestions, the pre-sync backup, the sign-in session | Not encrypted. Signing out does **not** erase it |
| Browser `sessionStorage` | Nothing | |
| Server | Resume text and profile pass through during a search (for scoring) and during AI actions | Not stored. Resume files never arrive |
| Supabase (only with sync on) | Resume text without its email addresses, phone numbers and LinkedIn addresses. **Cover letters, notes, application details and saved contacts are copied in full** | Names and street addresses remain. A second device receives the stripped resume text; only the device that already had the full text keeps it. A copy uploaded before this change keeps full text until it is saved again: delete the cloud copy and turn sync on again |
| Storage buckets | None: the app uses no file storage | |
| Public directories | No uploads are written anywhere | |

## Tests

Run on 2026-11-26 on Windows.

| Check | Result |
| --- | --- |
| `npm test` | 774 passed, 37 files |
| `npm run typecheck`, `npm run lint`, `npm run build` | Clean |
| `npm run test:e2e` (Chrome) | 11 passed, including reading PDF, DOCX and TXT in the browser |
| Archive check over the 17 `.docx` files shipped with `mammoth` | All accepted (run once by hand) |
| `npm run check:bundle` after a build with made-up secrets | None found; a planted value was detected |
| Signed-in walk in Chrome against a stand-in sign-in server on this machine | Signed out locked, signed in, status and search answered, signed out locked; no console errors |
| `npm audit` | 0 vulnerabilities |
| Open Dependabot alerts | 0 |

| Requested test | Where | What it does and does not show |
| --- | --- | --- |
| 1, 2. Visitors get 401 | `tests/security.test.ts` | Every `route.ts` found on disk, so a new unguarded route fails |
| 3. Missing configuration fails closed | same | Each of the three values missing or malformed |
| 4. Another account cannot reach your records | same (403) and `tests/database-access.test.ts` | The real migrations in an in-process Postgres (PGlite) that imitates Supabase's roles. **Not run against a live Supabase** |
| 5. Details not in responses or logs | `tests/security.test.ts` | One failing AI call, the status route, and a scan for logging of messages |
| 6. Hostile or oversized files | `tests/resume-file.test.ts` | Includes archives that lie about their size |
| 7. Limits hold across instances | `tests/security.test.ts`, `tests/database-access.test.ts` | Fresh module copies share a stand-in counter, and the SQL function counts in Postgres. Not run on Vercel |
| 8. Public storage access denied | none | **Not applicable and not tested:** there is no storage. `verify_access.sql` query 3 checks your project has no public bucket |
| 9. No secrets in browser files | `scripts/check-bundle.mjs`, run in CI | |

Tests that changed: the seven upload-route tests were removed with the route and replaced by file-reading tests;
one recruiter-search test now expects the opt-in even when signed in; two browser tests now expect the closed state.
Other feature tests run as a stand-in owner (`tests/setup.ts`).

## Remaining risks

1. **The page itself is public until you turn on Deployment Protection.** App sign-in protects the server and the
   cloud data, not the static page.
2. **Not verified live:** Supabase, Vercel protection, job boards with the new redirect rule, and the workflows' new
   headers.
3. The Content-Security-Policy allows inline scripts and styles (Next writes them into the page).
4. Session token and all data in `localStorage`; anyone using your browser profile can read them. There is no
   "erase this device" button and no multi-factor sign-in in the app.
5. Resume text still goes to your server for scoring, and to Anthropic if you turn AI on.
6. PDF text extraction moved from `pdf-parse` to `pdfjs-dist`. Check your own resume's text after uploading; layouts
   with columns may read differently. Tried only in Chrome.
7. Each private request makes two calls to Supabase (who is this, and the limit), which adds a little delay.
8. Rate limits count per owner, so a stolen session could use them up. Failed sign-ins are limited per instance only,
   plus whatever Supabase applies.
9. Fixes from pull request 7 (slow regular expressions and HTML stripping) are **not** in this branch.

## When pull request 7 is merged as well

Expect conflicts. Afterwards, before deploying:

- `/api/job-check` calls `requireSignedIn`, so it closes automatically, but should use `guard` for the shared limit.
- `/api/job-assessment` has no sign-in check: add `guard`. The route test fails until you do.
- The two new panels must call `apiFetch`, and their server logs should use `logFailure`.
- Add both routes to the list in `tests/security.test.ts`.

The wiki on branch `docs/project-wiki` describes the app before these changes. Its known-risks and security pages
need updating once this is merged.
