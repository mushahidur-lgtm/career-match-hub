# Claude Code prompt library

[Wiki home](../README.md)

Copy-ready prompts for maintaining and extending Career Match Hub with Claude Code. These are kept apart from the technical documentation.

## How to use

1. Open Claude Code in the repository root.
2. Copy one prompt block.
3. Replace every `[PLACEHOLDER]`.
4. Review the plan before approving changes.

Common placeholders: `[FEATURE_NAME]`, `[BUG_DESCRIPTION]`, `[FILE_OR_DIRECTORY]`, `[EXPECTED_BEHAVIOUR]`, `[ERROR_MESSAGE]`, `[PR_NUMBER]`, `[BRANCH_NAME]`, `[ENDPOINT]`, `[SERVICE_NAME]`.

Each prompt is either read-only (investigate and report) or a change prompt (plan, approve, implement, test). Neither allows committing, pushing, merging or deploying without your approval.

## Categories

| Category | Prompts |
| --- | ---: |
| [Project understanding](01-project-understanding.md) | 4 |
| [Code review](02-code-review.md) | 5 |
| [Bug fixing](03-bug-fixing.md) | 5 |
| [Feature development](04-feature-development.md) | 5 |
| [UI and UX improvements](05-ui-ux-improvements.md) | 5 |
| [Testing and QA](06-testing-and-qa.md) | 5 |
| [Security audit](07-security-audit.md) | 6 |
| [Performance optimization](08-performance-optimization.md) | 5 |
| [Refactoring](09-refactoring.md) | 5 |
| [Documentation maintenance](10-documentation-maintenance.md) | 4 |
| [Deployment and DevOps](11-deployment-and-devops.md) | 5 |
| [Database and API](12-database-and-api.md) | 5 |
| [Release readiness](13-release-readiness.md) | 5 |
