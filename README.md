# Career Match Hub

Upload your resume, see which jobs fit your skills, and track every application in one place.

- **Resume versions and a real profile.** Keep several resumes (one per kind of role) and choose which one matching uses. Each is read into a profile you can edit: dated work history, education, certifications, skills, level and years of experience. Claude does the reading when a key is set, and a keyword parser does it otherwise. Anything Claude lists that the resume text does not contain is dropped, so the profile never claims experience you do not have.
- **Overview.** Key numbers, best matches, newly posted jobs, highest salaries, applications that need attention and trending skills, all computed from your latest search and the jobs you track. Nothing on it is made up, and a number with no data behind it is left out.
- **Discover jobs.** Filter by title, city, category, work mode (Remote, Hybrid, On-site), employment type (Full-time, Contract, Part-time) and minimum salary.
- **Transparent match scoring.** Every job gets a 0 to 100 score built from six weighted parts you can inspect and re-weight, with required versus preferred skills, related skills, resume evidence, gaps, a confidence level and a plain explanation. 90 and above is green, 70 to 89 is blue, below 70 is amber.
- **My applications.** Save jobs, move them through Saved, Applied, Interviewing, Offer and Rejected, add notes, and export to CSV.
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
      status/route.ts             Which features are live (no key values)
  components/
    AppShell.tsx                  Sidebar navigation (top bar on phones)
    Overview.tsx                  Overview page
    ResumeManager.tsx             Resume versions, upload, profile editor
    MatchBreakdown.tsx            Score breakdown shown in the job dialog
    SettingsPanel.tsx             Preferences, match weights, backup and restore
    SearchFilters.tsx             City, role, work mode, employment type, salary
    JobCard.tsx                   Job card and match analysis dialog
    SavedJobsBoard.tsx            Tracker, notes, CSV export
    StatusBanner.tsx, ui.tsx      Live/Demo banner and shared pieces
  lib/
    anthropic.ts                  Claude client, structured output, model failover
    matching/                     Weighted scoring engine and requirement parser
    resume-sections.ts            Work history, education and certification parsing
    ai-profile.ts                 Turns Claude's reading into a verified profile
    overview.ts                   Overview numbers
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
