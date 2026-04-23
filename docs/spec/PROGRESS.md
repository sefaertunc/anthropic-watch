# PROGRESS.md

## Current Status

**Phase:** Phase 5 — Client Library (production, v1.3.0 shipped; client `@sefaertunc/anthropic-watch-client@1.0.0` ready for npm publish)
**Last Updated:** 2026-04-23

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
- [x] Phase 5 — Client Library (v1.3.0, 2026-04-23)
  - Monorepo restructuring: `packages/client/` sibling to the scraper at repo root. No workspaces tooling — manual cross-package coordination by design.
  - `@sefaertunc/anthropic-watch-client@1.0.0` — zero-dep, ESM-only, Node 18+. Public API: `AnthropicWatchClient` class (`fetchAllItems`, `fetchSourceItems`, `fetchRunReport`, `filterNew`), pure helpers (`uniqueKey`, `filterNew`, `dedupe`), typed error hierarchy (`AnthropicWatchError`, `FeedVersionMismatchError`, `FeedFetchError`, `FeedMalformedError`), constants (`SUPPORTED_FEED_VERSION`, `DEFAULT_BASE_URL`).
  - JSDoc-sourced TypeScript types generated via `tsc --emitDeclarationOnly` at publish time; `dist/index.d.ts` transitively surfaces `Item`/`FeedEnvelope`/`RunReport` via `export * from "./types.js"`.
  - 53 client tests: helpers, errors, client (mocked fetch), fixture byte-identity with `docs/fixtures/`, and drift-protection for the FEED-SCHEMA Programmatic Consumption example (extracts the inline `run(seenSet)` function, runs it twice with a shared `Set`, asserts dedup invariants).
  - FEED-SCHEMA Programmatic Consumption example restructured to export `async function run(seenSet)`; inline example retained as canonical reference for non-JS consumers and kept honest by the drift test.
  - Root `vitest.config.js` excludes `packages/**` so the scraper test command stays unchanged. One-time `test.yml` `pull_request` trigger expansion to `[develop, main]` so feature PRs to develop get CI coverage.
  - Scraper code, state, workflows (except `test.yml` trigger), and feed output all unchanged from v1.2.0.

## In Progress

**Release execution for v1.3.0 (scraper) and client 1.0.0 (npm publish).** Release PR from develop → main is the next step after this sync commit. Pre-publish gates (placeholder sweep, `npm ci` + `npm run types` + dist inspection + consumer TS smoke in scratch dir + `npm pack --dry-run`) must ALL pass before `npm publish --access public` from `packages/client/`.

## Next Steps

1. Merge release PR (develop → main). Tag `v1.3.0` on main and create the GitHub release.
2. Run Phase 6.2.5 pre-publish verification gates for the client package, then `cd packages/client && npm ci && npm run types && npm publish --access public`. Confirm `npm whoami` is correct before publishing; `--access public` is required for scoped packages.
3. Phase 7 post-publish: `npm view @sefaertunc/anthropic-watch-client` returns correct metadata; live install smoke in `/tmp/aw-client-smoke` fetches items and shows `uniqueKey` populated.
4. Continue source additions as new public Anthropic surfaces appear. Follow the pattern in `.claude/skills/project-patterns/SKILL.md` and `docs/ADDING-SOURCES.md`.
5. Watch the dashboard and run-report for sources with `consecutiveFailures > 0` — that's the signal for scraper rot (usually a site redesign).
6. v2.0 RSS `guid` composite-key change is scheduled for the next envelope-version bump — not before. Any v1.x.y release must keep `guid` as bare `id`.
7. Subpackage CI job (`cd packages/client && npm ci && npm test` in a matrix step) is deferred — pick up in v1.3.1 if `packages/client/` changes in follow-up PRs start slipping through without test coverage.

## Blockers

None.

## Notes

- `SCRAPER_PAT` repo secret must exist with `repo` + `workflow` scopes. Without it the scraper job fails at checkout.
- The first scheduled run after any new-source PR emits a backfill burst — that's expected, not a regression.
