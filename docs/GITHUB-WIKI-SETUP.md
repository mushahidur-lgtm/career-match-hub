# Publishing these pages to the GitHub Wiki

[Home](README.md)

The pages are plain Markdown and are readable in the repository as they are. Publishing a Wiki is optional.

> **Before publishing:** the repository is public and these pages list open security weaknesses
> ([known risks](07-security/known-risks.md)). Fix them first, or decide you accept that publication.

## Differences in a GitHub Wiki
* A Wiki is a separate Git repository: `<repository>.wiki.git`.
* Page names are flat; folders are not shown as sections. Links are by page name, without `.md`.
* Relative links to source files do not work from a Wiki; they must become full GitHub URLs.
* Mermaid diagrams render in Wiki pages.

## Option A: link, do not copy (recommended)
Create one Wiki page, `Home`, linking to
`https://github.com/mushahidur-lgtm/career-match-hub/blob/main/docs/README.md`. Nothing to keep in step.

## Option B: copy
1. In repository Settings enable **Wikis** and create the first page in the web interface.
2. Clone it outside the project folder:
```bash
git clone https://github.com/mushahidur-lgtm/career-match-hub.wiki.git
```
3. Copy pages, renaming to unique flat names (for example `Architecture-System.md`) and `README.md` to
   `Home.md`.
4. Rewrite links: between pages to the new names; to source files to
   `https://github.com/mushahidur-lgtm/career-match-hub/blob/main/<path>`.
5. Review, commit and push the Wiki repository yourself.

Treat `docs/` as the source of truth and re-copy after changes. No automation is provided.
