# Overview

[Home](../README.md)

## What it does

Searches job boards, scores each posting against your resume with an explanation, flags what to check
(eligibility, partial or closed postings), and tracks applications, interviews and contacts.

## The problem

Job boards return many postings, often cut short, with no honest account of fit. The app aims to help decide
**which jobs to apply for**: it separates matched, related and missing skills, never invents experience or
listings, and says when it does not know.

## Users

One job seeker per browser. There is no multi-user product: cloud sync is for one owner's devices, and the app
has no sign-up screen.

## Primary journeys

1. Upload or paste a resume, correct the extracted profile.
2. Set preferences (roles, cities, salary, eligibility facts).
3. Search, filter and open jobs; read the match analysis.
4. Save a job, track the application and interviews.
5. Optionally find recruiters named for a job, and draft a message yourself.

## Main features

See the [feature index](../03-features/feature-overview.md).

## Design principles visible in the code

* **Browser owns the data.** The server routes are stateless; storage is `localStorage`.
* **Everything optional is off.** No job key means no jobs, not invented ones. No AI key means rule-based results.
* **Rules first, AI bounded.** Claude may adjust a score by at most 15 points and cannot change eligibility.
* **Evidence or nothing.** Quotes from AI are checked against the resume before display.

Next: [Local development](local-development.md) · [System architecture](../02-architecture/system-architecture.md)
