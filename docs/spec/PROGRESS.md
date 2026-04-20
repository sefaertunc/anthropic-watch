# PROGRESS.md

## Current Status

**Phase:** Phase 3 — Source Growth (production, v1.1.0 shipped)
**Last Updated:** 2026-04-21

## Completed

- [x] Phase 1 — Foundation (v1.0.0, 2026-04-16)
  - Core pipeline: orchestrator, 6 scraper types, state management
  - Feed generation: JSON, RSS 2.0, OPML 2.0, run-report, run-history
  - 16 initial sources across Core/Extended tiers
  - Vitest suite: unit, per-scraper, e2e, with fixture injection
  - GitHub Actions workflows: daily cron, test, Pages deploy
  - Dashboard (`public/index.html`) — vanilla HTML + DOM APIs
  - Consumer-facing docs: ARCHITECTURE, SOURCES, FEED-SCHEMA, WORCLAUDE-INTEGRATION, ADDING-SOURCES, TROUBLESHOOTING
- [x] Phase 2 — Hardening (v1.0.1, 2026-04-16)
  - Scraper error propagation fix (no more silent failures)
  - First-run failure detection fix
  - `github-changelog` ID stability (heading-derived, not whole-file hash)
  - `docs-release-notes` stabilized via new `model-table` parse mode
  - `fetchWithRetry`: retry on 429 with `Retry-After` honoring
  - Dashboard XSS hardening (`safeUrl`, `textContent`/`createElement`)
  - Workflow: rebase-retry push loop to survive cron races
- [x] Phase 3 — Source Growth (v1.1.0, 2026-04-20)
  - `api-sdk-py-releases` added (17 sources total)
  - Branch-name enforcement workflow (`feat/*` required on PRs to `main`)
  - Scraper checkout + gh-pages deploy switched to `SCRAPER_PAT` so downstream workflows fire

## In Progress

Nothing open. The next change should begin with a SPEC check and a fresh feature branch.

## Next Steps

1. Continue source additions as new public Anthropic surfaces appear. Follow the pattern in `.claude/skills/project-patterns/SKILL.md` and `docs/ADDING-SOURCES.md`.
2. Watch the dashboard and run-report for sources with `consecutiveFailures > 0` — that's the signal for scraper rot (usually a site redesign).
3. Phase 4 items (live drift detection, dashboard browser tests, more consumers) are conditional — only pursue when a concrete need emerges.

## Blockers

None.

## Notes

- `SCRAPER_PAT` repo secret must exist with `repo` + `workflow` scopes. Without it the scraper job fails at checkout.
- The first scheduled run after any new-source PR emits a backfill burst — that's expected, not a regression.
