# Architecture decisions

[Home](../README.md)

Reconstructed from code comments, the README and the engineering notes. "Reason" is what those sources state.

| Decision | Reason | Consequence |
| --- | --- | --- |
| Browser storage, no server database | Privacy and no running cost | No cross-device use without sync; browser quota limits |
| Sync as one versioned JSON blob per user | Simple conflict rule: never overwrite an unseen version | No per-record queries; payload can reach megabytes |
| Single scorer (`scoreJob`) | Avoid two engines drifting apart | All behaviour changes go through one file |
| Rules first, AI bounded to ±15 | Same input gives same base score; AI cannot invent fit | AI cannot rescue a poorly extracted posting |
| Eligibility separate from score | A fit can be high and still not permitted | Two things to show in the UI |
| Unknown is "needs verification", never a fail | Avoid false rejections | Many jobs may need a check until facts are entered |
| No sample jobs in production | Do not present invented listings | A deployment without keys shows nothing |
| Recruiter web search off by default | A public site must not spend the owner's credit | Extra setup to enable |
| Zod everywhere for stored and incoming data | `localStorage` and files are untrusted | New fields must be added to schemas or they are dropped |
| **[PR 7]** Posting checks on demand, not during search | The search route already uses most of its time budget on AI | Search scores still read partial text |
| **[PR 7]** Page reads limited to a fixed host list | The apply link comes from the browser | Employers' own career sites are not read |
