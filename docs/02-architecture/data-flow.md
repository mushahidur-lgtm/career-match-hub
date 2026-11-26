# Application and data flow

[Home](../README.md)

## Resume processing

```mermaid
flowchart LR
    F[PDF, DOCX, TXT, MD] --> P["/api/parse-resume: size and type checks"]
    T[Pasted text] --> A
    P --> A["/api/analyze-resume"]
    A -->|key set| C["Claude: structured profile"]
    A -->|no key| H["heuristics.ts: keyword profile"]
    C --> V["ai-profile.ts: drop anything not in the resume"]
    V --> S[(browser: resume version + profile)]
    H --> S
```

## Job search

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as /api/search-jobs
    participant P as providers
    participant E as engine (scoreJob)
    participant C as Claude
    B->>S: filters, profile, resume text, preferences
    S->>P: fetchJobs (Adzuna then JSearch, or all)
    P-->>S: normalized, de-duplicated, status noted
    S->>E: score every job by rules
    S->>S: split ranked and excluded
    opt ANTHROPIC_API_KEY set
        S->>C: top shortlist, batches of 10
        C-->>S: bounded adjustments and quotes
        S->>E: re-score with adjustment
    end
    S-->>B: jobs, excluded, ai, warnings
```

## Where data lives

| Data | Location | Leaves the browser when |
| --- | --- | --- |
| Resume text, profile versions | `localStorage` | Parsing, analysis, search, any AI button, sync |
| Preferences, eligibility facts | `localStorage` | Search, morning run (via sync), assessment |
| Search results | `localStorage` | Not sent back |
| Applications, interviews, notes | `localStorage` | Sync only |
| Contacts, watchlist, feedback | `localStorage` | Sync only |
| Uploaded files | Server memory during parsing | Not stored |
| Daily run results | Supabase `daily_runs` | Written by the server |

`localStorage` keys start with `cmh:` (`resumes`, `activeResume`, `preferences`, `filters`, `results`,
`applications`, `intel`, `contacts`, `watchlist`, `feedback`, `insights`, `assessments` **[PR 7]**, `refine`,
`sort`, `tab`, `appview`, `cloud`, `schema`, plus `backup:*` and `recovered:*`). Layout upgrades are in
[storage.ts](../../src/lib/storage.ts).

Privacy detail: [Security overview](../07-security/security-overview.md#sensitive-data).
