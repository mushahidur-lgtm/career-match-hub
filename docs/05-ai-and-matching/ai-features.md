# AI architecture, resume analysis, recommendations and prompts

[Home](../README.md)

## Provider and models
Anthropic only. [anthropic.ts](../../src/lib/anthropic.ts): default `claude-sonnet-4-5`, fallback
`claude-sonnet-5-5` when the model is gone; `ANTHROPIC_MODEL` overrides. Structured calls use
`messages.parse` with a Zod output format, low effort where supported, 50 s timeout and one retry. Web search
uses a separate client: 110 s, no retry (a retry would be billed again).

## Where AI is used

| Feature | Prompt and schema location | Sent | Checked by |
| --- | --- | --- | --- |
| Resume analysis | [analyze-resume](../../src/app/api/analyze-resume/route.ts) | Resume text | Facts must appear in the resume |
| Search review | [career-fit.ts](../../src/lib/ai/career-fit.ts) (`SYSTEM`, `career-fit-1`) | Candidate summary, resume (14,000 chars), up to 10 postings per call (2,500 chars each) | Schema, ±15, quotes verified |
| Resume suggestions | [job-insights](../../src/app/api/job-insights/route.ts) | Resume, posting, rule findings | Quotes verified; unsafe rewrites dropped |
| Interview practice | [interview-prep](../../src/app/api/interview-prep/route.ts) | Resume, posting, stage | Quotes verified |
| Message drafts | [networking-draft](../../src/app/api/networking-draft/route.ts) | Contact, job, matching skills | Unsupported claims discard the draft |
| Recruiter search | [web-search.ts](../../src/lib/contacts/web-search.ts) | Company, title, location, start of posting (not the resume) | [verify.ts](../../src/lib/contacts/verify.ts) |
| **[PR 7]** Deep assessment | [deep-assessment.ts](../../src/lib/ai/deep-assessment.ts), [model.ts](../../src/lib/assessment/model.ts) | Resume, posting (8,000), rule findings | Quotes verified, recommendation clamped |

Prompts live next to their code; there is no prompt registry. Change `PROMPT_VERSION` when a cached prompt
changes.

## Deterministic versus AI

| Deterministic | AI |
| --- | --- |
| Requirement reading, skill matching, evidence levels, eligibility, caps, ranking order, confidence | Profile reading (when a key is set), the ±15 adjustment, written advice, contact search |

## Prompt-injection handling
Postings are treated as data: invisible characters removed, instruction-like sentences dropped and flagged,
angle brackets neutralised ([sanitize.ts](../../src/lib/jobs/sanitize.ts)); system prompts say so; the model
has no tools in scoring calls; output is schema-checked and bounded. Pattern matching catches known phrasings
only.

## Caching, limits, failures
Search review: server memory, 1 hour, hashed keys, 2 calls per search at most, 85 s deadline **[PR 7]**
(95 s on `main`). Assessment: 6 hours server, 15 jobs in the browser. Failures fall back to rule-based results
and say so; details in [error handling](../04-technical-reference/error-handling.md).

## Cost
Not measured. The estimate in [matching-engine-v2.md](../matching-engine-v2.md) is about $0.12 to $0.15 per
uncached search at Sonnet 5.5 list prices cached 2026-11-03; check current prices and your usage. Web search is
billed per search. The morning run makes no AI calls.

## Privacy
Resume text goes to Anthropic for the features above when a key is set; for search review that happens on every
search with a profile. Production had no key on 2026-11-26.
