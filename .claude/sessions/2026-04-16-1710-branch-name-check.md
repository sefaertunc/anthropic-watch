# Session: 2026-04-16

**Branch:** feat/add-branch-name-check
**Task:** Add branch-name enforcement workflow + wire scraper to use PAT so downstream workflows trigger.

## Completed

- Added `.github/workflows/branch-name-check.yml` — enforces `feat/*` naming for PRs targeting `main`, with allowlist for `dependabot/*` and `renovate/*`.
- Updated `.github/workflows/scrape.yml` checkout to use `SCRAPER_PAT` so scraper commits are attributed to a PAT identity.
- Switched gh-pages deploy token from `GITHUB_TOKEN` to `SCRAPER_PAT` so the `pages` push can trigger downstream workflows (default `GITHUB_TOKEN` pushes don't).

## Files Modified

- .github/workflows/branch-name-check.yml (new)
- .github/workflows/scrape.yml

## Notes for Next Session

- Requires `SCRAPER_PAT` repo secret to exist with `repo` + `workflow` scopes, otherwise the scraper job will fail at checkout.
- PR was opened against `main` by explicit user request (skill default is `develop`).
