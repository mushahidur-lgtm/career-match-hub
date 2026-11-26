# Career Match Hub

Upload your resume, see which jobs fit your skills, and track every application in one place.

- **Resume versions and a real profile.** Keep several resumes (one per kind of role) and choose which one matching uses. Each is read into a profile you can edit: dated work history, education, certifications, skills, level and years of experience. Claude does the reading when a key is set, and a keyword parser does it otherwise. Anything Claude lists that the resume text does not contain is dropped, so the profile never claims experience you do not have.
- **Overview.** Key numbers, best matches, newly posted jobs, highest salaries, applications that need attention and trending skills, all computed from your latest search and the jobs you track. Nothing on it is made up, and a number with no data behind it is left out.
- **Discover jobs.** Search by title and city, then refine the results without searching again: minimum match score, salary range, location, work arrangement, employment type, category, seniority, posted date, company, title and application status. Results show salary, posting age, match score and confidence, and your status, are paged 15 at a time, and export to CSV. Repeated listings of the same posting within a search are merged into one. A posting more than 30 days old is flagged as possibly closed; a missing posting date is shown as such and never guessed.
- **Transparent match scoring.** Every job gets a 0 to 100 score built from six weighted parts you can inspect and re-weight, with required versus preferred skills, related skills, resume evidence, gaps, a confidence level and a plain explanation. 90 and above is green, 70 to 89 is blue, below 70 is amber.
- **Job details in five tabs.** Overview, Job description (with the required and preferred skills read from it), Match analysis, Resume recommendations and Application. Resume recommendations quote the lines from your resume to lead with, the keywords on your profile that your resume never names, lines that lack a result, projects to put forward, and the gaps stated honestly. The Application tab has your status, notes, the apply link and a preparation summary. With a Claude key you can also ask for reworded lines and a tailored summary; every line Claude quotes is checked against your resume, and a rewrite that adds a skill you have not listed or a number that was not in your line is removed.
- **My applications.** A full tracker. Stages run New, Interested, Preparing Application, Applied, Interview, Offer, with Rejected, Withdrawn and Closed as outcomes. Use a Kanban board (drag a card, or use its Move to menu) or a sortable table. Each application keeps the dates (applied, follow-up, deadline, expected reply), the resume version you used, a cover letter, recruiter contact details, your salary expectation, offer details, the rejection reason, notes, and a dated activity history. Moving to Applied records the date and resume and suggests a follow-up a week later. Add jobs you found elsewhere, and the same posting can never be tracked twice. Export everything to CSV.
- **Interview tracker.** Every interview across your applications: stage, format, date and time, interviewers, topics to review, questions to ask, preparation notes and feedback. Adding one moves the application to the Interview stage. Practice prompts come from the posting and are labelled as practice, not a prediction of what will be asked; a skill you lack is prompted as "how would you get up to speed", never as experience to claim. With a Claude key you can ask for tailored prompts and answer outlines, and any resume line it quotes is checked against your resume.
- **Career intelligence.** Charts of what your own searches have shown you: new jobs found per day, average match score, where the jobs are, stated pay bands, remote versus hybrid versus on-site, the skills asked for most (and which you lack), the companies hiring for you, applications by status, how many applications reached an interview, and a comparison of your target roles (for example Data Engineer against BI Developer). Everything is counted from jobs your searches returned and applications you track. It is not the whole market, and the page says so. Each chart is labelled observed or estimate: match scores are the only estimates. Pay counts only what the employer stated in CAD. A conversion rate is withheld until you have sent 5 applications. Sample jobs from demo mode are left out unless you tick a box. Every chart has a table view.
- **Search history.** Every search is kept in this browser (up to 500 searches and 1,500 jobs, no descriptions), so trends build over days and weeks. Run a search again, delete one, or forget everything. Searches made with no job source connected are not kept.
- **Cloud sync and a morning run (optional).** Connect your own free Supabase project to sign in, keep your data in step across devices, and have a search run for you every day from 8:00 AM Toronto time. Off by default: without the keys the app is exactly the browser-only app described here. Sync never overwrites a copy it has not seen. The morning run uses rule-based scoring only, so it costs nothing beyond the job-board calls. Setup is below.
- **Career site watchlist.** For government, crown corporation and company career sites that the job boards do not cover. Keep their addresses, choose how often to be reminded, mark each one checked when you have looked, and log a posting you find as an application. Nothing is scraped: the app never reads those sites. A few suggested addresses (Job Bank, the GC Jobs guidance page, Ontario's GOjobs, Canada Post's job portal) are one click to add; they were found through a web search and you should confirm each one opens the page you expect. For any other crown corporation, add the careers page yourself.
- **HR & Recruiter Finder.** A Find recruiter button on every job (card, details and application) looks for the people publicly tied to hiring for it: names the posting itself states, plus an optional Claude web search. Every person comes with the source that names them and a verification status. Save contacts, track your networking with them (Discovered to Follow-up), schedule follow-ups, and get truthful message drafts. Nothing is ever sent for you. See "HR & Recruiter Finder" below.
- **Reminders.** The Overview lists follow-ups due, upcoming interviews, application deadlines, expected replies and offer decision dates, from the dates you set. They appear in the app only; nothing is emailed yet.
- **Honest about its data.** Jobs come only from a connected job board (Adzuna or JSearch). With no job-board key a deployed site shows no jobs and says so. `npm run dev` shows clearly labelled sample jobs for development only. Resume analysis falls back to a keyword engine when there is no Claude key.
- **Built for a permanent full-time search.** The default filter is Permanent full-time with a CAD $100,000 minimum. Jobs that state a lower salary are hidden, jobs that state none stay and are marked Salary unknown, and salaries a job board only estimated never hide a job. Edit your cities, roles and minimum in Settings.
- **Your data stays yours.** Settings exports and imports a JSON backup. Existing data is snapshotted before any upgrade, and unreadable data is set aside rather than overwritten.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and the Anthropic SDK.

## Architecture overview

```
Browser (Next.js client)                          Server (Next.js route handlers, stateless)
  your data: localStorage  ─────────────────▶  /api/search-jobs      ─▶ Adzuna or JSearch   (only if a job-board key is set)
  (resumes, applications, contacts, history)   /api/analyze-resume,
                                                /api/job-insights,
                                                /api/interview-prep   ─▶ Anthropic           (only if ANTHROPIC_API_KEY is set)
                                                /api/find-recruiter   ─▶ Anthropic web search (only if a key AND RECRUITER_WEB_SEARCH=1 or sign-in is required)
                                                /api/status            (reports which features are on; never key values)
  optional: Supabase sign-in + synced copy ◀──▶ /api/cron/daily        ◀─ GitHub Actions at 8:00 AM Toronto (needs CRON_SECRET)
```

- **The browser owns your data.** Resumes, applications, contacts, history and settings live in `localStorage`. The server keeps no database and no session of its own.
- **The server is a thin, stateless layer.** Each route reads its keys from environment variables, calls one outside service when asked, and returns the result. Without a key the route says so instead of inventing data.
- **Everything optional is off by default.** The sections below show what each setting turns on.

## Modes: what each configuration turns on

| Mode | Settings | What works | What does not |
| --- | --- | --- | --- |
| **Local-only (no keys)** | none | Resume profile (keyword engine), match scoring (keyword engine), applications and interviews tracker, career-site watchlist, Find Recruiter in free mode (names, emails and phones the posting prints, plus Google, Bing and LinkedIn search links you open yourself), contacts and networking tracker, backup and import | Live jobs (production shows none and says so; `npm run dev` shows labelled sample jobs), Claude features, cloud sync |
| **Job source** | `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`, or `RAPIDAPI_KEY` | Live job search. Calls go from the server to the job board | Claude features, cloud sync |
| **Optional Claude** | `ANTHROPIC_API_KEY` (optionally `ANTHROPIC_MODEL`) | Claude resume reading, match review, tailored suggestions, interview practice, message drafts | Recruiter web search stays off until `RECRUITER_WEB_SEARCH=1` (or sign-in is required) |
| **Claude recruiter web search** | `ANTHROPIC_API_KEY` and `RECRUITER_WEB_SEARCH=1`, optionally `FIND_RECRUITER_MAX_PER_HOUR` | Find Recruiter also searches the public web and reads public pages. This bills your Anthropic account | LinkedIn and other login-only sites are never read |
| **Optional Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `DAILY_RUN_EMAILS`, optionally `DAILY_MAX_SEARCHES`, `DAILY_BUDGET_SECONDS` | Password sign-in, synced copy across devices, the 8:00 AM Toronto morning run. Sign-in becomes required for paid routes | Nothing else changes |

### Every environment variable, by name

Set these in `.env.local` locally or in Vercel's Environment Variables. Names only; never commit a value. `.env.example` has the same list with comments.

| Variable | Where it is read | Public to the browser? |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Server | No |
| `ANTHROPIC_MODEL` | Server | No |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Server | No |
| `RAPIDAPI_KEY` | Server | No |
| `CMH_DEMO` | Server (allows labelled sample jobs in production) | No |
| `AI_SHORTLIST`, `JOB_PROVIDER_MODE` | Server (search tuning) | No |
| `RECRUITER_WEB_SEARCH` | Server | No |
| `FIND_RECRUITER_MAX_PER_HOUR` | Server | No |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser (fixed at build time; protected by row-level security) | Yes, by design |
| `SUPABASE_URL` | Server (optional alias of the public URL) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Bypasses row-level security | **Never** |
| `CRON_SECRET` | Server, and a GitHub repository secret of the same name | No |
| `DAILY_RUN_EMAILS`, `DAILY_MAX_SEARCHES`, `DAILY_BUDGET_SECONDS` | Server (morning run) | No |

GitHub repository secrets used by workflows: `SITE_URL` and `CRON_SECRET` (the morning run only). The CI, CodeQL, dependency-review and deployment-check workflows use no secrets.

## Quick start

You need Node.js 20.16 or newer (CI uses Node 22).

```bash
npm install
cp .env.example .env.local   # optional: add your keys
npm run dev
```

Open http://localhost:3000. With no keys the dev server shows sample jobs so you can try the whole app.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run test:e2e:install` | Download the Chromium browser used by the smoke tests (once) |
| `npm run test:e2e` | Run the browser smoke tests against a production build (run `npm run build` first) |

### Testing and releases

Before opening a pull request, run the same checks CI runs: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, then `npm run test:e2e`. If you already have Chrome or Edge, `PW_CHANNEL=chrome npm run test:e2e` (or `msedge`) uses it instead of downloading a browser.

The browser smoke tests start the production build with every optional key blanked, mock the app's own job-search route, and **block every request that leaves the machine**, so a test fails if the app ever tries to reach Anthropic, Adzuna, JSearch, LinkedIn or any people-search service. They use only invented names and addresses.

| Workflow | Runs on | What it checks |
| --- | --- | --- |
| **CI** (`ci.yml`), job *Unit tests, lint, typecheck, build* | Pull requests, pushes to `main` | `npm ci`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` on Node 22 with the npm cache |
| **CI**, job *Browser smoke tests* | Pull requests, pushes to `main` | `npm ci`, installs Chromium, `npm run build`, `npm run test:e2e`. Uploads the Playwright report only if it fails |
| **CodeQL** (`codeql.yml`) | Pull requests, pushes to `main`, weekly | Static security analysis of the TypeScript source |
| **Dependency review** (`dependency-review.yml`) | Pull requests | Fails a pull request that adds a dependency with a known high or critical vulnerability |
| **Deployment smoke check** (`deployment-smoke.yml`) | A successful Production deployment, or run by hand with a URL | Two plain GET requests: the home page answers and contains the app, and `/api/status` has the expected shape. Never sends a POST, searches for jobs or starts a recruiter lookup |
| **Morning job run** (`daily-run.yml`) | Daily schedule, by hand | Calls the protected morning-run endpoint (needs the `SITE_URL` and `CRON_SECRET` secrets) |

Dependabot (`dependabot.yml`) opens weekly update pull requests for npm packages and GitHub Actions. Branch protection is a repository setting, not something these files can switch on: to require the CI checks before merging, enable it under Settings, Branches, and select **Unit tests, lint, typecheck, build** and **Browser smoke tests**. See [CONTRIBUTING.md](CONTRIBUTING.md).

## API keys

Every key is optional. Put them in `.env.local` for local use, or in Vercel's environment variables when deployed. Keys are only read on the server and are never sent to the browser.

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Claude resume analysis and AI match scoring | https://console.anthropic.com/settings/keys |
| `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` | Live jobs (tried first) | https://developer.adzuna.com/signup |
| `RAPIDAPI_KEY` | Live jobs through JSearch (used if Adzuna is not set or fails) | https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch |
| `ANTHROPIC_MODEL` | Optional model override | See below |

### Which features each key turns on

| Keys set | Resume analysis | Match scores | Jobs |
| --- | --- | --- | --- |
| None | Keyword engine | Keyword engine | None in production; sample jobs in `npm run dev` |
| `ANTHROPIC_API_KEY` | Claude | Claude reviews the top 20 | None in production; sample jobs in `npm run dev` |
| Adzuna or RapidAPI | Keyword engine | Keyword engine | Live |
| Both | Claude | Claude reviews the top 20 | Live |

If a live provider fails (bad key, rate limit, outage) the app tries the next one, then shows no jobs and tells you why. Sample jobs appear only in development, or where you set `CMH_DEMO=1`. If Claude fails, you get keyword results and a message instead of an error page.

### The Claude model

The app uses `claude-sonnet-4-5` by default, as specified. **Anthropic retires that model on 2026-11-30.** When the API reports it as gone, the app switches to `claude-sonnet-5-5` on its own and keeps using it until the server restarts. To skip the failed first call, set `ANTHROPIC_MODEL=claude-sonnet-5-5` in your environment.

Resume analysis makes one structured-output request per click. A search review sends your resume with the top 20 rule-ranked jobs in batches of 10, so at most 2 requests per search; results are cached in server memory for an hour, keyed by a hash. Set `AI_SHORTLIST` to review fewer (0 switches it off).

### Live job data notes

- **Adzuna** has no remote or hybrid filter, and returns only the first 500 characters of each description. Work mode and employment type are inferred from the text when Adzuna does not state them, and the Apply link opens the full posting. Searches cover Canada (`ca`) or the US (`us`), chosen from the city you enter. Remote - Anywhere searches both.
- **JSearch** is queried through the RapidAPI `/search` endpoint. The parser also accepts the newer `/search-v2` response shape.
- Filters that a posting does not state are not applied to it. A job with no salary stays in the list when you set a minimum salary, and a job with no stated work mode counts as On-site.

## How matching works

Every job gets a score from 0 to 100 that you can take apart. Rules compute a deterministic score, so the same resume and posting always give the same result. With a Claude key, a bounded adjustment of at most 15 points is added for the shortlist. Details and the reasons for the design are in `docs/matching-engine-v2.md`.

**Pipeline:** retrieve, normalize and merge duplicates, note the posting's state, extract requirements, check eligibility, score by rules, review a shortlist with Claude, rank.

**The seven parts and their default weights** (change them in Settings; they are scaled to 100%):

| Part | Weight | What it looks at |
| --- | ---: | --- |
| Technical skills | 25% | Required skills in full, preferred at 40%, each scaled by how your resume shows it |
| Relevant experience | 25% | Years asked versus years on your resume, and whether the title matches roles you have held |
| Responsibilities | 20% | The kind of work the job describes against the work and projects on your resume |
| Career alignment | 10% | Only the primary and secondary roles you set, and your exclusions |
| Seniority | 10% | The level in the title or the years asked, against your level |
| Domain | 5% | Whether the posting's industry appears on your resume |
| Location and work arrangement | 5% | Your preferred cities and Remote - Canada |

A part the posting gives no information about is skipped, and the remaining parts share its weight. Salary is a filter and a note, never part of the score.

**Evidence.** A skill shown in work under an employer earns 100%, in a project 70%, in study or training 40%, and only listed 25%. A related technology earns a share of that and is shown as related, with what does and does not carry over, never as matched.

**Eligibility** (citizenship or residency, work authorization, sponsorship, clearance, required languages) is checked against facts you enter in Settings. A job is ruled out only when the posting states a requirement and your own statement contradicts it. Anything unknown is "needs verification". Ruled-out and closed jobs are listed separately with the reason.

**Score limits.** A total is held down, and the reason shown, when: what your resume shows covers under half of the required skills, counting listed and related skills only in part (65); none are (55); the role is outside your work and targets (60); the skill words match but the day-to-day work does not (60); the role is three or more levels above you (55), two above (70) or two or more below (65); it is outside your cities (69); it mentions a word you excluded (50); or there is too little detail to call it excellent (89).

**Confidence** is a separate 0 to 100 value with a High, Medium or Low label: how much there was to judge by. It never changes the score.

**Required versus preferred.** The posting is read for sections such as Requirements and Nice to have, and for wording such as "an asset" or "is a plus". When it has no structure, every skill counts as required and confidence drops. Adzuna returns only the first 500 characters of a posting, so scores from Adzuna alone carry lower confidence; JSearch supplies full descriptions.

**With a Claude key,** the top 20 jobs that are still candidates are reviewed against your full resume. Claude may move the score by at most 15 points, cannot lift it past the limits above, cannot change eligibility, and any resume line it quotes is kept only if it appears word for word. Postings are treated as untrusted data: instruction-like text is removed and flagged, and the review has no tools. Without Claude, or if it fails, you get the rule-based score and the result says so.

**Your profile is the source of truth.** Matching uses the skills on your profile, so removing a skill you do not have changes your scores. Scores go stale, and the app tells you, when your skills, preferences or weights change after a search.

Scores are guidance about fit. They do not predict hiring decisions.

## Cloud sync and the morning run

This part is optional and needs a free [Supabase](https://supabase.com) project. Nothing here is created for you: you make the project and put its keys into your own settings. Never paste keys into chat.

**What it does**

- **Sync.** After you sign in and turn it on, your resumes (full text), applications, notes, interviews, search history and preferences are copied to a private table in your own Supabase project, and kept in step between devices. Row-level security means only your signed-in account can read or change them.
- **It never overwrites what it has not seen.** Every save names the version it started from. If another device saved in the meantime, the two are combined instead (applications and resumes by identity, history by id; the newer copy of an application wins) and a copy of this device's data is kept first under `cmh:backup:pre-sync`. A change made on one device is carried to the other only when the other has not changed; deletions are not carried over by a combine. If the cloud copy disappears, nothing is re-uploaded until you say so.
- **Morning run.** A scheduled GitHub job calls `/api/cron/daily`. From 8:00 AM Toronto time, once a day, it searches each primary role in two of your cities, rotated so all of them are covered (up to 12 job-board calls, set with `DAILY_MAX_SEARCHES`; the Greater Toronto Area and Toronto are one search, because the job board treats them the same; each call returns at most 50 jobs), scores them with your selected resume by the rules (no Claude calls, no AI cost), and stores the result. Your browser picks it up the next time you open the app, adds it to your search history and shows it on the Overview. Sample data is never used, and a search that failed is not recorded.
- **No email or push notifications yet.** Those need another service (some are paid), so the results appear in the app only.

**Cost.** Supabase's free plan covers one person's use. Supabase pauses free projects after a period of inactivity (check their current terms); daily activity from the morning run should keep yours awake, but I have not verified that. GitHub Actions is free for this use. The job-board quota is the real limit: Adzuna does not publish its free-tier number in the places I could check, and one unofficial source says about 1,000 calls a month. 12 calls a day is about 360 a month. Check your own plan on the job board's dashboard and lower `DAILY_MAX_SEARCHES` if needed.

**Setup**

1. Create a project at supabase.com. In **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql` and run it.
2. In **Authentication, Users**, choose **Add user** and create your own account with an email and password. (The app has no sign-up screen on purpose.)
3. In the Supabase dashboard under **Authentication** (the exact menu names change, so look for the sign-in or providers settings), turn **off** "Allow new users to sign up". This stops strangers creating accounts on your project.
4. In **Project Settings, API**, copy the Project URL, the anon public key and the service_role key.
5. In **Vercel, Project Settings, Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET` (a long random string you make up, at least 16 characters) and `DAILY_RUN_EMAILS` (your sign-in email). **Redeploy afterwards**: the two `NEXT_PUBLIC` values are fixed when the site is built. For local use, put the same names in `.env.local`.
6. In **GitHub, Settings, Secrets and variables, Actions**, add repository secrets `SITE_URL` (your https site address, with no trailing path) and `CRON_SECRET` (the same string as in Vercel).
7. Open the app, **Settings, Cloud sync**, sign in and turn on sync. The morning run needs this first, because it reads your resume and preferences from the synced copy.
8. Test it: in GitHub, **Actions, Morning job run, Run workflow**, tick "force", and run. The log shows how many searches and jobs it found. Refresh the app and look at the Overview.

**Good to know**

- Scheduled GitHub workflows run only on the default branch, can start several minutes late (the endpoint runs whenever it is called after 8:00 Toronto time), and are **disabled by GitHub after 60 days with no repository activity**. The workflow starts at 12:00, 13:00 and 15:00 UTC; the endpoint runs once. If the morning run stops, open the Actions tab and re-enable the workflow; a commit also resets the clock.
- Sign-in is by email and password with Supabase's session kept in this browser. Use **Sign out** on shared computers.
- **Delete my cloud data** (Settings) removes the synced copy and the stored runs. It does not touch this device.

## HR & Recruiter Finder

**What it finds, and where from**

1. **The posting itself.** If the posting says "Recruiter: Jane Smith" or "Jane Smith, Talent Acquisition Partner", that is read directly. This is the strongest evidence, it is free, and it runs the first time you open Find recruiter for a job.
2. **Web search and page reading (optional, off by default, costs money).** Claude runs up to 8 searches from a plan built from the company, the job title and the team that would hire for it (company + title + recruiter, + Talent Acquisition, + Technical Recruiter, + the relevant department, + HR Manager, + Hiring Manager, careers pages, public profile results), reads up to 5 public pages in full (company careers and team pages; LinkedIn and other login-only sites are blocked from being read), and reports several people, not just the first. "Search for more contacts" runs another pass that looks for different people. It stays off until you set `RECRUITER_WEB_SEARCH=1` (or the site has cloud sync configured, which makes sign-in required). An Anthropic key alone does not turn it on, so adding a key for resume analysis cannot quietly open paid searches to every visitor. When enabled, with `ANTHROPIC_API_KEY` set, the button "Search the web for contacts" asks Claude to search the public web with Anthropic's web search tool, up to 4 searches per lookup. Anthropic charges per search plus the normal usage; I have not verified current prices, so check Anthropic's pricing before using it. Web search may also need to be enabled for your Anthropic organisation in the Anthropic Console. The result is saved per job, so reopening a job does not search again.
3. **You.** Add anyone you found yourself, with where you found them. They are recorded as added by you and stay a "possible match" until you mark them verified.
4. **Search links.** Links open Google, Bing and LinkedIn searches in your own browser: recruiter for this job, talent acquisition, hiring manager, the likely hiring department, and the company careers page. They are plain searches you open yourself. The app never visits, reads or scrapes those pages, and never builds a profile address.

**Free mode (no `ANTHROPIC_API_KEY`).** Find recruiter stays useful without any AI key:
- The posting text is read for recruiters, talent acquisition, HR, hiring managers, the person a role "reports to", and named department leaders. A business email or phone number is taken only when it is printed on the same line, after that name (or before it when no other name is on the line), never built from a name. A mailbox printed next to a name is labelled as possibly shared. Personal mailboxes (gmail, outlook and similar) are ignored.
- Each listing shows whether its description is full, short or only the start of the posting (Adzuna returns 500 characters), where its apply link leads (employer, application system, job board, Adzuna redirect), how old it is, and whether it is likely closed. For a partial description there is a clearly labelled link to read the full posting on its own site. The app does not scrape it. When the same job comes from Adzuna and JSearch, a complete description replaces a truncated one, word for word.
- When nobody is named, the panel says what was checked, why nothing is shown (truncated description, missing employer, no person named, a shared mailbox), and the one next step worth taking, with the search links above.
- "Hide N likely closed" sits next to the result count. A job is likely closed when it is over 30 days old or its own text says it is filled, expired or closed. This is a hint to check, because no job board says when a posting closes.
- A saved contact can be reused for other jobs at the same employer ("Also use for this job") and unlinked again. Notes, networking status, next follow-up date and the source address belong to the person, not the job. The same person is recognised by profile address, or by exact name and employer when one copy has no profile address.

**Why a lookup can return nothing.** Three things, in order of how often they bite:
1. Web lookups are off. On a site with no `ANTHROPIC_API_KEY` (or without `RECRUITER_WEB_SEARCH=1` when sign-in is not enforced) only the posting text is read, and Adzuna cuts postings to 500 characters, so almost none name anyone. The page says which case applies.
2. The evidence was too thin. Search results only carry a title and address, and citations only a 150 character excerpt. Reading whole pages is what lets a name on a team page be checked, and a name that no page text supports is dropped, on purpose.
3. Nobody is publicly named. Many companies do not publish recruiter names. The page then lists what was searched and which pages were read, and gives search shortcuts.

**Confidence.** High: a source ties the person to this company, a recruiting role and this posting. Medium: company and recruiting role are supported, but not this posting. Low: partial evidence, shown as not verified. A person who a page says is a "former" employee is capped at Low, and a person whose passage names a different employer is dropped. Each person is labelled as a recruiter for this posting, a recruiter at this company, an HR professional at this company, or a potential hiring manager. Ranking favours recruiters over HR executives, then the right team and the right city.

**Measuring it.** `npm run eval:recruiters -- --jobs my-jobs.json` runs real lookups on jobs you list (copy `scripts/eval-jobs.example.json`, which holds placeholders and is refused until you replace them) and reports: the share of searches that found at least one contact (any, medium or higher, high), the share of contacts with a source and evidence, the duplicate rate, latency (mean, median, p95), failures and their messages, and cost per search (search fees at Anthropic's documented $10 per 1,000 searches, plus tokens if you pass `--price-in` and `--price-out`). It needs the site running with a key and `RECRUITER_WEB_SEARCH=1`, waits between jobs for the rate limit, and writes names to its report, so keep that private. I have not run it: I have no Anthropic key and I do not look up real people to test. The automated tests of the same figures use invented companies and people and show only that the checking behaves across kinds of job, not how well real search finds recruiters.

**What is never done.** The app does not scrape LinkedIn or any site, does not log in anywhere, and does not look for named people in general: web lookups are always for one job at one named company. It never builds an email address from a name pattern, never constructs a profile link, and never sends a message or request.

**How a result is checked.** The model's own words are never evidence. A person is kept only if a search result's title or a passage the search tool quoted from a page contains their name. Then:
- A job title is kept only if a source shows it next to their name; otherwise it is left blank.
- An email is kept only if it appears word for word next to their name in a source AND its local part holds their name (so careers@ or someone else's address is never attached to them). A phone number is kept only if it sits next to their name, with no other named person closer.
- Each source is judged on its own passage: the company, the role and the job must appear with the person's name, not elsewhere on the same page. A person whose passage names a different employer is dropped.
- A LinkedIn address is kept only if it was literally a search result whose title shows the person.
- Confidence (never above 98) and the status come from fixed rules, not from the AI: **Verified** needs the company, a recruiting role and a tie to this job in the sources; **Likely match** needs the company and role; **Possible match** is weaker. A senior HR leader (chief HR officer, VP, head of HR) is never more than "possible" unless a source ties them to this job.
- Anything the AI wrote about why someone matters is shown separately, labelled as an AI inference.
- Web pages are untrusted. A page that says something false about itself can still produce a false result, which is why every contact shows its sources and quotes so you can check them.

**Your data.** Contacts are saved in this browser, included in backups and cloud sync, and can be edited or deleted. Deleting is permanent and is remembered so syncing another device cannot bring a contact back. Contacts hold only public professional details plus your own notes and history. Use them responsibly: contact people in line with the site's rules and the law (for example anti-spam rules for commercial email).

**Cost and abuse protection.** The lookup route is rate limited per visitor and per hour per server instance (`FIND_RECRUITER_MAX_PER_HOUR`, default 20). If cloud sync is configured on the site, you must be signed in (and on the `DAILY_RUN_EMAILS` list, if set) to run a web lookup; web lookups are also off unless `RECRUITER_WEB_SEARCH=1` is set. AI drafts need sign-in too when cloud sync is configured, and otherwise are limited only by rate limits, like the other Claude features. Sample (demo) jobs never trigger a search.

**Messages.** The networking assistant writes a LinkedIn connection note (kept under 300 characters, LinkedIn's usual limit for a note; check yours), an introduction, a follow-up and an email. It uses your selected resume and the job. It says you applied only if an application date is recorded, refers to earlier contact only if you recorded it, and mentions only skills on your resume that the posting asks for. AI-written drafts are checked the same way and thrown away if they claim anything unsupported. You copy a draft or open it in your email app, and you press "I sent this" yourself to record it. Placeholders like [Your name] are left for you to fill in.

**Limits.** The web search and web fetch path has only been tested with mock responses built from Anthropic's documented formats: it has never been run against the live service, so real-world hit rates, latency and cost are unmeasured. The fetch tool cannot read pages that need JavaScript to display. Names that appear on no public page cannot be found. LinkedIn profile text is not read.

## Privacy

- By default your resume versions, profiles, filters, results and saved jobs live only in your browser's `localStorage`. Nothing is stored on the server and there is no database.
- **If you turn on cloud sync**, a copy of your resumes (full text), applications, notes, interviews, search history and preferences is stored in your own Supabase project, behind row-level security. The service key that the morning run uses exists only on the server and is read in one server-only file. Anyone with access to your Supabase project, Vercel project or GitHub secrets can see or use those things, so protect those accounts.
- Tailored suggestions and interview practice are sent to Anthropic only when you press the button: the posting and your resume text. The result is cached in this browser (the last 20 jobs) so it is not requested again.
- Search history is stored under its own key and is part of the JSON backup. It holds only compact notes of jobs seen (title, company, location, stated pay, score, skills), not descriptions. Entries that cannot be read are set aside like applications.
- Applications load one at a time: if one entry cannot be read, the rest still load, and the damaged one is set aside. Settings lets you download what was set aside.
- Applications are stored under their own key. The upgrade copies your earlier saved jobs there and leaves the old copy untouched, so returning to the previous release still shows them.
- Upgrades save a snapshot of your previous data in the same browser storage, and keep the old single-resume copy so you can return to the previous release without losing anything. Those copies include your old resume text. Settings has a button to delete them once you are happy.
- Uploaded files are parsed in memory on the server and discarded.
- With `ANTHROPIC_API_KEY` set, your resume text and the job postings in view are sent to Anthropic for analysis and scoring.
- Anyone who can open a deployed copy can use your API keys through it. Add a Vercel Firewall rate-limit rule, or Vercel Deployment Protection, if the site is public. The app has a small per-instance rate limit, but it resets whenever a serverless instance restarts.

### Privacy boundaries and external services

What the app contacts, and when. Anything not listed here is never contacted.

| Service | Contacted when | What is sent |
| --- | --- | --- |
| Adzuna or JSearch (RapidAPI) | You press Search jobs, or the morning run starts, and a job-board key is set | Your job title, city and filters. Not your resume |
| Anthropic | You press an AI button and `ANTHROPIC_API_KEY` is set | The posting and your resume text for that action |
| Anthropic web search and page reading | You press "Search the web for contacts" and recruiter web search is enabled | The company, job title, location and the start of the posting. Not your resume |
| Supabase | Cloud sync is configured and you are signed in | Your synced data, into your own project |
| Google, Bing, LinkedIn | **Only when you click a search link yourself**, in your own browser | Nothing from this app. The app never opens, reads or scrapes those pages |

Hard boundaries for recruiter discovery:
- No contact is ever invented. Every person shown has a source that names them, and an email, phone number or profile address appears only if a source prints it word for word. Nothing is built from a name.
- LinkedIn and other login-only sites are never read, scraped or fetched. Profile addresses are kept only if they were a public search result or you pasted them.
- Nothing is ever sent on your behalf. Messages are drafts you copy or open in your own email app.
- Contacts, notes and networking history stay in your browser (and your own Supabase project if you turn sync on).
- Tests and CI block outside network access and use invented data only.

## Deploy to GitHub and Vercel

### 1. Push to GitHub

```bash
gh repo create mushahidur-lgtm/career-match-hub --public --source=. --remote=origin --push
```

Or with plain git, after creating an empty repository named `career-match-hub` on GitHub:

```bash
git remote add origin https://github.com/mushahidur-lgtm/career-match-hub.git
git push -u origin main
```

### 2. Deploy on Vercel

**One click:** https://vercel.com/new/clone?repository-url=https://github.com/mushahidur-lgtm/career-match-hub

The link deploys with no keys, so the site finds no jobs until you add a job-board key. Add keys afterwards under Project Settings, Environment Variables, then redeploy.

**Or from the dashboard:**

1. Go to https://vercel.com/new and import `career-match-hub`.
2. Leave the framework preset on Next.js and the defaults as they are.
3. Under Environment Variables, add whichever keys you have (see the table above). A job-board key is needed for any real listings.
4. Click Deploy.

**Or from the CLI:** `npx vercel` then `npx vercel --prod`. Add keys with `npx vercel env add ANTHROPIC_API_KEY`.

Notes for Vercel:

- Uploads are limited to 4 MB, below Vercel's 4.5 MB request body limit.
- The analysis and search routes allow up to 120 seconds (`maxDuration` in their `route.ts` files). If your plan caps functions lower, reduce that number.
- After adding or changing environment variables, redeploy so they take effect.

## Project structure

```
.github/                          Workflows (CI, CodeQL, dependency review, deployment check, morning run), Dependabot, issue and PR templates
e2e/                              Browser smoke tests (Playwright); playwright.config.ts at the root
tests/                            Unit tests (Vitest)
src/
  app/
    page.tsx                      Page coordination, state, persistence
    layout.tsx, globals.css       Fonts, color tokens, dark mode
    api/
      parse-resume/route.ts       PDF, DOCX, TXT and MD text extraction
      analyze-resume/route.ts     Claude profile extraction, keyword fallback
      search-jobs/route.ts        Provider search, filtering, AI match scoring
      job-insights/route.ts       Tailored resume suggestions, checked against the resume
      interview-prep/route.ts     Tailored interview practice, checked against the resume
      status/route.ts             Which features are live (no key values)
      cron/daily/route.ts         Protected morning run (called by GitHub Actions)
      find-recruiter/route.ts     Guarded Claude web search for a job's recruiters
      networking-draft/route.ts   Optional AI message drafts, checked for false claims
  components/
    AppShell.tsx                  Sidebar navigation (top bar on phones)
    Overview.tsx                  Overview page
    ResumeManager.tsx             Resume versions, upload, profile editor
    MatchBreakdown.tsx            Score breakdown shown in the job dialog
    SettingsPanel.tsx             Preferences, match weights, backup and restore
    SearchFilters.tsx             City, role, work mode, employment type, salary
    JobCard.tsx                   Job card
    JobDetailDialog.tsx           Five-tab job detail view
    ApplicationsPage.tsx          Board and table of applications
    ApplicationDialog.tsx         One application: dates, contacts, offer, interviews, history
    InterviewEditor.tsx           One interview, with practice prompts
    InterviewTracker.tsx          Interviews across all applications
    CareerIntelligence.tsx        Charts and role comparison
    contacts/                     HR & Recruiter Finder page, dialogs and networking assistant
    Watchlist.tsx, WatchlistCard.tsx  Career site watchlist page and Overview reminder
    SearchHistory.tsx             Past searches
    charts.tsx                    Bar, column and line charts with table views
    AddApplicationDialog.tsx      Add a job found elsewhere
    ResultFilters.tsx             Refine-results panel
    SavedJobsBoard.tsx            Tracker, notes, CSV export
    StatusBanner.tsx, ui.tsx      Live/Demo banner and shared pieces
  lib/
    anthropic.ts                  Claude client, structured output, model failover
    matching/                     Weighted scoring engine and requirement parser
    resume-sections.ts            Work history, education and certification parsing
    ai-profile.ts                 Turns Claude's reading into a verified profile
    overview.ts                   Overview numbers
    history.ts, history-load.ts   Recording searches and jobs seen; reading them back
    contacts/                     Recruiter contacts: model, evidence verifier, drafts, web search
    watchlist/                    Career sites you check by hand: model, reminders, storage
    cloud/                        Optional Supabase sync, sign-in and the morning run
    intelligence.ts               Career intelligence figures, from observed data only
    refine.ts, dedupe.ts          Result filters and duplicate merging
    applications.ts               Pipeline moves, history, interviews, reminders
    interview-prep.ts             Practice prompts and the checks on Claude's
    saved.ts                      Finding and changing tracked applications
    job-meta.ts                   Posting age and level
    resume-help.ts, insights.ts   Resume recommendations and the checks on Claude's suggestions
    storage.ts, backup.ts         Versioned storage, migrations, backup and import
    heuristics.ts, skills.ts      Keyword profile and the skills dictionary
    providers/                    adzuna.ts, jsearch.ts, demo.ts, shared helpers
    format.ts                     Salary, dates, sorting, CSV
  types/job.ts                    Shared TypeScript interfaces
```

## Troubleshooting

- **"No text was found in this PDF."** The PDF is a scan. Export a text-based PDF or paste the text.
- **Banner says no job source is connected after adding keys.** Restart `npm run dev` so the new environment is loaded. If a live search failed, the results page shows the reason above the list.
- **"The Anthropic API key was rejected."** Check `ANTHROPIC_API_KEY` for stray spaces or quotes.
- **Claude requests go somewhere unexpected.** The Anthropic SDK honours an `ANTHROPIC_BASE_URL` environment variable. If one is set in your shell or tooling, requests go there instead of to Anthropic. Unset it to use the default endpoint.
- **Recruiter discovery is disabled, or "Search the web for contacts" is missing.** Free mode is the default and is not an error: Find Recruiter still reads names printed in the posting and gives you search links. The web search button appears only when all of these are true: `ANTHROPIC_API_KEY` is set, and either `RECRUITER_WEB_SEARCH=1` is set or cloud sync is configured (which makes sign-in required), and you redeployed after setting them. Check `/api/status` on your site: `ai` must be `true` and `recruiterWebSearch` must be `true`. Other causes: Web search is not enabled for your Anthropic organisation in the Anthropic Console (the lookup fails with a clear message); you have reached `FIND_RECRUITER_MAX_PER_HOUR` or the per-visitor limit (3 per minute, 12 per hour); the job is a sample job or the posting does not name the employer ("Company not listed"), which are never searched; or you are not signed in on a site that requires sign-in.
- **Find Recruiter shows nobody even though a recruiter exists.** Job boards often return only part of a posting (Adzuna returns 500 characters), so a name further down is not seen. The panel says when the description is partial and links to the full posting. Names on pages that need JavaScript or a login cannot be read.
- **The browser smoke tests fail locally.** Run `npm run build` first (they test the production build), install the browser once with `npm run test:e2e:install` or set `PW_CHANNEL=chrome`, and make sure port 3100 is free. A failure that says the app "tried to reach an outside host" means a code change added a network call: that is the test doing its job.
- **A console warning says the model is deprecated.** That is the SDK noting that `claude-sonnet-4-5` retires on 2026-11-30. Set `ANTHROPIC_MODEL=claude-sonnet-5-5` to move off it.

### Limits to know about (morning run)

- **Function time.** The endpoint asks for up to 300 seconds, which Vercel's current docs list for the Hobby plan with **Fluid compute** on. Confirm Fluid compute is enabled for your project (Project Settings, Functions). If your limit is shorter, the function is stopped before it saves anything, and the Actions log shows an HTTP error. Lower `DAILY_MAX_SEARCHES` and set `DAILY_BUDGET_SECONDS` (default 200) below your limit.
- **History capacity.** A run can add up to 400 distinct jobs. The history keeps the newest 1,500 jobs and 500 searches in this browser; when it is full the oldest go, and Career intelligence says so. If the market for your roles has more than that turning over within a month, earlier days will count lower than they were. I could not measure real volume without live job-board data, so watch for that notice.
- **Payload size.** Sync saves your whole data as one record, which can reach a few megabytes with many resumes and a full history. I have not tested Supabase's request-size limits against that.
