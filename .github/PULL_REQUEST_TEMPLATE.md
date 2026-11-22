## What and why

<!-- One purpose per pull request. Link an issue if there is one. -->

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Docs / CI / tooling (no product behaviour change)

## Checks run locally

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (if UI, recruiter, or job-search behaviour changed)

## Safety review

- [ ] No secrets, `.env` files, resumes, or real recruiter/contact details are included (code, tests, fixtures, screenshots, logs)
- [ ] No new outside network call. If one was added, it is documented in the README and mocked in tests
- [ ] No contact, email, phone number, or profile address is invented or built from a name
- [ ] Works without optional keys (free mode), or the change says why it cannot

## Tests and docs

- [ ] Tests added or updated (including a false-positive case for extraction or verification changes)
- [ ] README or `.env.example` updated if behaviour or configuration changed

## Notes for the reviewer

<!-- Anything risky, anything you could not verify, and what you did not change. -->
