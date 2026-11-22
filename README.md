# Career Match Hub

Upload your resume, see which jobs fit your skills, and track every application in one place.

- **Resume analyzer.** Drop in a PDF, DOCX, TXT or MD file, or paste the text. Claude extracts your experience, seniority, categorized skills and 5 to 8 job titles worth searching. You can fix any skill before searching.
- **Job search.** Filter by title, city, category, work mode (Remote, Hybrid, On-site), employment type (Full-time, Contract, Part-time) and minimum salary.
- **Match scoring.** Every job gets a score from 0 to 100 with the skills you have, the gaps, and a one-line reason. 85 and above is green, 70 to 84 is blue, below 70 is amber.
- **Tracker.** Save jobs, move them through Saved, Applied, Interviewing, Offer and Rejected, add notes, and export to CSV.
- **Works with no keys.** Without API keys the app runs in **Demo Mode** (sample jobs) with keyword-based analysis. A banner always shows what is live.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and the Anthropic SDK.

## Quick start

You need Node.js 20.16 or newer.

```bash
npm install
cp .env.example .env.local   # optional: add your keys
npm run dev
```

Open http://localhost:3000. With no keys you can use the whole app in Demo Mode.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
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
| None | Keyword engine | Keyword engine | Demo sample jobs |
| `ANTHROPIC_API_KEY` | Claude | Claude (top 20 results) | Demo sample jobs |
| Adzuna or RapidAPI | Keyword engine | Keyword engine | Live |
| Both | Claude | Claude (top 20 results) | Live |

If a live provider fails (bad key, rate limit, outage) the app tries the next one, then falls back to Demo Mode and tells you why. If Claude fails, you get keyword results and a message instead of an error page.

### The Claude model

The app uses `claude-sonnet-4-5` by default, as specified. **Anthropic retires that model on 2026-11-30.** When the API reports it as gone, the app switches to `claude-sonnet-5-5` on its own and keeps using it until the server restarts. To skip the failed first call, set `ANTHROPIC_MODEL=claude-sonnet-5-5` in your environment.

Resume analysis and scoring each make one structured-output request per click, so cost stays low and predictable. Scoring sends a single batched request for the top 20 keyword-ranked results.

### Live job data notes

- **Adzuna** has no remote or hybrid filter, and returns only the first 500 characters of each description. Work mode and employment type are inferred from the text when Adzuna does not state them, and the Apply link opens the full posting. Searches cover Canada (`ca`) or the US (`us`), chosen from the city you enter. Remote - Anywhere searches both.
- **JSearch** is queried through the RapidAPI `/search` endpoint. The parser also accepts the newer `/search-v2` response shape.
- Filters that a posting does not state are not applied to it. A job with no salary stays in the list when you set a minimum salary, and a job with no stated work mode counts as On-site.

## How matching works

1. **Analysis.** Claude returns the profile as JSON that is validated against a schema. Without a key, a built-in dictionary of about 150 common technologies reads your skills, dates your experience from the work history, and ranks job titles by skill overlap.
2. **Search.** The server calls the live provider, drops postings that contradict your filters, scores every posting with the keyword engine, and sorts them.
3. **AI scoring.** If a Claude key is set, the top 20 are sent to Claude in one request with your profile. Claude returns a score, matching skills, missing skills and a reason for each. When Claude scores all 20, only those 20 are shown so every score is on one scale.

Scores are guidance about skill and title overlap. They do not predict hiring decisions.

## Privacy

- Your resume text, profile, filters, results and saved jobs live in your browser's `localStorage`. Nothing is stored on the server and there is no database.
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

**One click:** https://vercel.com/new/clone?repository-url=https://github.com/mushahidur-lgtm/career-match-hub&env=ANTHROPIC_API_KEY,ADZUNA_APP_ID,ADZUNA_APP_KEY,RAPIDAPI_KEY

**Or from the dashboard:**

1. Go to https://vercel.com/new and import `career-match-hub`.
2. Leave the framework preset on Next.js and the defaults as they are.
3. Under Environment Variables, add whichever keys you have (see the table above). You can leave all of them out to launch in Demo Mode.
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
    page.tsx                      Dashboard: tabs, state, persistence
    layout.tsx, globals.css       Fonts, color tokens, dark mode
    api/
      parse-resume/route.ts       PDF, DOCX, TXT and MD text extraction
      analyze-resume/route.ts     Claude profile extraction, keyword fallback
      search-jobs/route.ts        Provider search, filtering, AI match scoring
      status/route.ts             Which features are live (no key values)
  components/
    ResumeUploader.tsx            Upload, paste, editable skill tags, role pills
    SearchFilters.tsx             City, role, work mode, employment type, salary
    JobCard.tsx                   Job card and match analysis dialog
    SavedJobsBoard.tsx            Tracker, notes, CSV export
    StatusBanner.tsx, ui.tsx      Live/Demo banner and shared pieces
  lib/
    anthropic.ts                  Claude client, structured output, model failover
    heuristics.ts, skills.ts      Keyword analysis and scoring
    providers/                    adzuna.ts, jsearch.ts, demo.ts, shared helpers
    format.ts                     Salary, dates, sorting, CSV
  types/job.ts                    Shared TypeScript interfaces
```

## Troubleshooting

- **"No text was found in this PDF."** The PDF is a scan. Export a text-based PDF or paste the text.
- **Banner says Demo Mode after adding keys.** Restart `npm run dev` so the new environment is loaded. If a live search failed, the results page shows the reason above the list.
- **"The Anthropic API key was rejected."** Check `ANTHROPIC_API_KEY` for stray spaces or quotes.
