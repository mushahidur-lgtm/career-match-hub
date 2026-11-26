# Resume upload, parsing, versions and profile

[Home](../README.md) · [Features](feature-overview.md)

## Overview
Holds up to 20 resume versions, each with an editable profile; matching uses the active one.

## User workflow
**Resume and profile**: upload PDF, DOCX, TXT or MD (4 MB at most) or paste text; check the extracted summary,
years, seniority, skills, roles, work history, education and certifications; edit anything wrong.

## Implementation
| Step | Source |
| --- | --- |
| UI | [ResumeManager.tsx](../../src/components/ResumeManager.tsx) |
| File to text | [parse-resume/route.ts](../../src/app/api/parse-resume/route.ts): size, extension and magic-byte checks; text capped at 60,000 characters; old `.doc` refused |
| Analysis | [analyze-resume/route.ts](../../src/app/api/analyze-resume/route.ts): Claude, or [heuristics.ts](../../src/lib/heuristics.ts) without a key |
| Checking AI output | [ai-profile.ts](../../src/lib/ai-profile.ts), [resume-sections.ts](../../src/lib/resume-sections.ts): jobs, schools and certificates kept only if the resume shows them |

**Your profile is the source of truth**: remove a skill and matching stops counting it.
Evidence levels (work, project, study, listed) are derived from the resume text at scoring time
([evidence.ts](../../src/lib/candidate/evidence.ts)).

**[PR 7]** adds field of study to education, and issuer and expiry for certifications.

## Errors
413 too large, 415 unsupported or mismatched type, 422 unreadable or almost no text (a scanned PDF), 429 rate
limit.

## Limitations
No OCR; no `.doc`; section detection is heuristic, so unusual layouts classify skills as "listed".

## Ideas
OCR for scans; show each skill's evidence level on the profile page.
