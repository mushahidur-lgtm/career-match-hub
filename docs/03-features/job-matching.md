# Job matching and resume-to-job comparison

[Home](../README.md) · [Features](feature-overview.md)

## Overview
Compares a posting with your profile and resume, giving a 0 to 100 score you can take apart, plus separate
eligibility, confidence and posting status.

## User workflow
Open **Match analysis** on a job: score summary, eligibility checks quoting the posting, strengths and gaps
with evidence, the seven weighted parts, caps, matched, missing and related skills. At the bottom you can
report a wrong skill or eligibility result, or mark the job not relevant; **nothing is re-weighted**.

## Implementation
[MatchBreakdown.tsx](../../src/components/MatchBreakdown.tsx), [match-v2.tsx](../../src/components/match-v2.tsx),
[engine.ts](../../src/lib/matching/engine.ts). The formula is in
[Matching algorithm](../05-ai-and-matching/matching-algorithm.md).

## Data flow
Resume text and profile are sent with each search; results (including match detail) are stored in the browser
and travel with saved applications.

## Configuration
Weights, target roles and eligibility facts are set under **Settings**. Claude review needs a key.

## Errors
If Claude is absent or fails, results are rule-based and say so.

## Limitations
* English pattern matching: unusual wording is missed.
* Weights and caps are not calibrated against outcomes.
* Eligibility facts cover Canada; other countries give "needs verification".
* **[PR 7]** benchmark findings: senior and off-city roles can read as "consider", a Tableau role scored high
  for a Power BI candidate ([report](../benchmark-report.md) **[PR 7]**).

## Ideas
Calibrate on labelled real postings; treat hard location or seniority conflicts as "not recommended".
