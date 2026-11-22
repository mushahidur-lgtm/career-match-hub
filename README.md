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
- **Search history.** Every search is kept in this browser (up to 200 searches and 1,200 jobs, no descriptions), so trends build over days and weeks. Run a search again, delete one, or forget everything. Searches made with no job source connected are not kept.
- **Reminders.** The Overview lists follow-ups due, upcoming interviews, application deadlines, expected replies and offer decision dates, from the dates you set. They appear in the app only; nothing is emailed yet.
- **Honest about its data.** Jobs come only from a connected job board (Adzuna or JSearch). With no job-board key a deployed site shows no jobs and says so. `npm run dev` shows clearly labelled sample jobs for development only. Resume analysis falls back to a keyword engine when there is no Claude key.
- **Built for a permanent full-time search.** The default filter is Permanent full-time with a CAD $100,000 minimum. Jobs that state a lower salary are hidden, jobs that state none stay and are marked Salary unknown, and salaries a job board only estimated never hide a job. Edit your cities, roles and minimum in Settings.
- **Your data stays yours.** Settings exports and imports a JSON backup. Existing data is snapshotted before any upgrade, and unreadable data is set aside rather than overwritten.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and the Anthropic SDK.

## Quick start

You need Node.js 20.16 or newer.

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
| `npm test` | Run the automated tests (Vitest) |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |

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
| `ANTHROPIC_API_KEY` | Claude | Claude reviews the top 15 | None in production; sample jobs in `npm run dev` |
| Adzuna or RapidAPI | Keyword engine | Keyword engine | Live |
| Both | Claude | Claude reviews the top 15 | Live |

If a live provider fails (bad key, rate limit, outage) the app tries the next one, then shows no jobs and tells you why. Sample jobs appear only in development, or where you set `CMH_DEMO=1`. If Claude fails, you get keyword results and a message instead of an error page.

### The Claude model

The app uses `claude-sonnet-4-5` by default, as specified. **Anthropic retires that model on 2026-11-30.** When the API reports it as gone, the app switches to `claude-sonnet-5-5` on its own and keeps using it until the server restarts. To skip the failed first call, set `ANTHROPIC_MODEL=claude-sonnet-5-5` in your environment.

Resume analysis and the search review each make one structured-output request per click, so cost stays low and predictable. The review sends your resume and the top 15 rule-scored results in a single request.

### Live job data notes

- **Adzuna** has no remote or hybrid filter, and returns only the first 500 characters of each description. Work mode and employment type are inferred from the text when Adzuna does not state them, and the Apply link opens the full posting. Searches cover Canada (`ca`) or the US (`us`), chosen from the city you enter. Remote - Anywhere searches both.
- **JSearch** is queried through the RapidAPI `/search` endpoint. The parser also accepts the newer `/search-v2` response shape.
- Filters that a posting does not state are not applied to it. A job with no salary stays in the list when you set a minimum salary, and a job with no stated work mode counts as On-site.

## How matching works

Every job gets a score from 0 to 100 that you can take apart. The score is computed by fixed rules, so the same resume and posting always give the same result. Claude only refines two of the six parts, and its changes are limited.

**The six parts and their default weights** (change them in Settings; they are scaled to 100%):

| Part | Weight | What it looks at |
| --- | ---: | --- |
| Technical skills | 30% | Required skills count fully, preferred skills 40%. A related tool (Azure for AWS, Power BI for Tableau) earns partial credit and is listed as related, never as matched |
| Relevant experience | 25% | Years asked versus years on your resume, and whether the title matches roles you have held |
| Responsibilities | 20% | The kind of work the job describes (pipelines, reporting, cloud, APIs and so on) against what your resume shows you did |
| Seniority | 10% | The level in the title or the years asked, against your level |
| Industry | 5% | Whether the posting's industry appears on your resume |
| Location and work arrangement | 10% | Your preferred cities and Remote - Canada. Greater Toronto Area, Ottawa and Gatineau include their suburbs |

A part the posting gives no information about is skipped, and the remaining parts share its weight.

**Score limits.** A weighted total is held down in these cases, and the reason is shown on the job:

- Fewer than half of the required skills matched: at most 65.
- None of the required skills on your resume: at most 55.
- The role is outside your resume and is not one of your target roles: at most 60.
- The role is three or more levels above you: at most 55.
- Outside your preferred cities: at most 69.
- Too little detail in the posting (low confidence, or fewer than three required skills): at most 89, so a thin posting cannot read as excellent.

**Each job shows:** the score and a confidence level (with the reasons), required and preferred skills matched, required skills you lack, related skills, lines copied from your resume that support the match, experience gaps, seniority, location and salary fit, and a plain-language explanation.

**Required versus preferred.** The posting is read for sections such as Requirements and Nice to have, and for wording such as "an asset" or "is a plus". When it has no structure, every skill counts as required and confidence drops. Adzuna returns only the first 500 characters of a posting, so scores from Adzuna alone carry lower confidence; JSearch supplies full descriptions.

**With a Claude key,** the top 15 results are reviewed against your full resume. Claude scores experience and responsibilities from what you actually did rather than which words appear, and suggests gaps. It cannot invent experience: the experience and responsibilities scores can move at most 25 points from the rule-based value, any resume line it quotes is kept only if it appears word for word in your resume, and it cannot lift a score past the limits above. The skill lists always come from the rules and your profile, never from Claude.

**Your profile is the source of truth.** Matching uses the skills on your profile, so removing a skill you do not have changes your scores. Scores go stale, and the app tells you, when your skills, preferences or weights change after a search.

Scores are guidance about fit. They do not predict hiring decisions.

## Privacy

- Your resume versions, profiles, filters, results and saved jobs live in your browser's `localStorage`. Nothing is stored on the server and there is no database.
- Tailored suggestions and interview practice are sent to Anthropic only when you press the button: the posting and your resume text. The result is cached in this browser (the last 20 jobs) so it is not requested again.
- Search history is stored under its own key and is part of the JSON backup. It holds only compact notes of jobs seen (title, company, location, stated pay, score, skills), not descriptions. Entries that cannot be read are set aside like applications.
- Applications load one at a time: if one entry cannot be read, the rest still load, and the damaged one is set aside. Settings lets you download what was set aside.
- Applications are stored under their own key. The upgrade copies your earlier saved jobs there and leaves the old copy untouched, so returning to the previous release still shows them.
- Upgrades save a snapshot of your previous data in the same browser storage, and keep the old single-resume copy so you can return to the previous release without losing anything. Those copies include your old resume text. Settings has a button to delete them once you are happy.
- Uploaded files are parsed in memory on the server and discarded.
- With `ANTHROPIC_API_KEY` set, your resume text and the job postings in view are sent to Anthropic for analysis and scoring.
- Anyone who can open a deployed copy can use your API keys through it. Add a Vercel Firewall rate-limit rule, or Vercel Deployment Protection, if the site is public. The app has a small per-instance rate limit, but it resets whenever a serverless instance restarts.

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
- **A console warning says the model is deprecated.** That is the SDK noting that `claude-sonnet-4-5` retires on 2026-11-30. Set `ANTHROPIC_MODEL=claude-sonnet-5-5` to move off it.
