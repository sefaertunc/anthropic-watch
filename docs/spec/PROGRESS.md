# PROGRESS.md

## Current Status

**Phase:** Phase 4 — Schema Hardening (production, v1.2.0 shipped)
**Last Updated:** 2026-04-22

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
  - Branch-name enforcement workflow (`develop` or `feat/*` required on PRs to `main`; `dependabot/*`/`renovate/*` allow-listed)
  - Scraper checkout + gh-pages deploy switched to `SCRAPER_PAT` so downstream workflows fire
- [x] Phase 4 — Schema Hardening (v1.2.0, 2026-04-22)
  - `uniqueKey` field (`${id}|${source}`) added to every JSON feed item — consumers dedupe directly without string concatenation
  - `docs/FEED-SCHEMA.md` expanded: Consumer Expectations (primary vs. observability), rewritten Programmatic Consumption example (version gating + composite-key dedup with fallback + state persistence), Reference Fixtures subsection, source-count variability warning, v2.0 RSS `guid` deferral note
  - Reference fixtures shipped at `docs/fixtures/{all,run-report}.sample.json` with `docs/fixtures/README.md` documenting provenance
  - Prose sweeps removing hardcoded source counts from README body copy, `docs/SOURCES.md`, `docs/ARCHITECTURE.md`, `docs/WORCLAUDE-INTEGRATION.md`, and `test/capture-fixtures.js`
  - RSS `guid` composite-key change deferred to v2.0 (one-shot re-notification burst inappropriate for a point release; batched with future envelope `version` bump)

## In Progress

Nothing open. The next change should begin with a SPEC check and a fresh feature branch.

## Next Steps

1. Continue source additions as new public Anthropic surfaces appear. Follow the pattern in `.claude/skills/project-patterns/SKILL.md` and `docs/ADDING-SOURCES.md`.
2. Watch the dashboard and run-report for sources with `consecutiveFailures > 0` — that's the signal for scraper rot (usually a site redesign).
3. v2.0 RSS `guid` composite-key change is scheduled for the next envelope-version bump — not before. Any v1.x.y release must keep `guid` as bare `id`.
4. Phase 5 items (live drift detection, dashboard browser tests, more consumers) are conditional — only pursue when a concrete need emerges.

## Blockers

None.

## Notes

- `SCRAPER_PAT` repo secret must exist with `repo` + `workflow` scopes. Without it the scraper job fails at checkout.
- The first scheduled run after any new-source PR emits a backfill burst — that's expected, not a regression.
