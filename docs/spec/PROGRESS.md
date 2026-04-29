# PROGRESS.md

## Current Status

**Phase:** Phase 6 — Community Sources (v1.4.2 shipped 2026-04-28; worclaude scaffolding 2.10.1 upgrade + new per-PR Version bump declaration workflow shipped 2026-04-30; no active feature work)
**Last Updated:** 2026-04-30

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
- [x] Phase 6 — Community Sources (v1.4.0, 2026-04-23)
  - Four new scraper types: `github-commits` (direct-commit activity on repos that ship via commits rather than tagged releases), `reddit-subreddit` (Reddit public JSON), `hn-algolia` (HN search API), `twitter-account` (twitterapi.io). All Rule-4 compliant — throw on HTTP/network/parse errors.
  - New `community` source category joining `core` and `extended`. Dashboard renders as a third grouped-sub-header; OPML feed emits a third `Community` outline group.
  - Twenty new community sources (17 → 37 total): 6 GitHub-commits, 5 Reddit subs, 1 HN filter, 8 Twitter handles. All handles verified active and on-topic via live API at implementation time.
  - `TWITTERAPI_IO_KEY` GitHub Actions secret (optional) with graceful-skip-on-missing-credential in the Twitter scraper — forks and local dev sessions work without it. One-line env pass-through in `.github/workflows/scrape.yml`; only workflow edit in v1.4.0.
  - Paired client release `@sefaertunc/anthropic-watch-client@1.0.1` widens both `Item.sourceCategory` and `SourceResult.category` TypeScript unions from `'core' | 'extended'` to `'core' | 'extended' | 'community'`. Runtime behavior unchanged.
  - `src/github-auth.js` (`githubHeaders()`) helper extracted to eliminate 3× header-construction duplication across GitHub scrapers.
  - Feed schema extensibility policy formalized in `docs/FEED-SCHEMA.md` — consumers must handle unknown `sourceCategory` values gracefully; the set is open.
  - SPEC.md Non-Goals refined: paid third-party APIs acceptable for `community`-category sources with graceful-skip + documented cost + fork-compatible. twitterapi.io at ≈$0.36/month is the sole current instance.
  - 30 new tests (145 total): 6 github-commits, 7 reddit-subreddit, 3 hn-algolia, 8 twitter-account (including Rule-4 graceful-skip carve-out coverage), 3 category pass-through feed tests, 3 OPML community-group round-trip tests.
- [x] v1.4.1 — Production Fixes (2026-04-24)
  - Reddit OAuth2: scraper switched from anonymous `www.reddit.com/*.json` (403 from GitHub Actions datacenter-IP range) to `oauth.reddit.com` with client_credentials bearer token, module-scope memoized token (one fetch per pipeline run shared across all 5 reddit-\* sources), one-shot 401 retry, graceful-skip when `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` absent. Credentials provisioning gated by Reddit's Responsible Builder Policy (Nov 2025 deprecation of self-service API keys) — sources return `[]` gracefully until approval lands.
  - Twitter rate-gate: module-scope chained-Promise `waitForSlot()` paces all `twitter-account` calls to 1 req / 6 s, serializing across all 8 Twitter sources so twitterapi.io's free-tier limiter doesn't 429. Adds ~+40 s pipeline wall-clock; accepted tradeoff.
  - Workflow hardening (`.github/workflows/scrape.yml`): state-commit retry replaced with stash-and-resync (no more broken rebase state between iterations); commit + deploy steps gated by `if: github.ref == 'refs/heads/main'` so feature-branch preflights run read-only; `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` env pass-through added.
  - Docs: `docs/TROUBLESHOOTING.md` Reddit 403 section rewritten (real cause: datacenter-IP block) + new OAuth setup entry flagging the November 2025 Responsible Builder Policy gate; `docs/reddit-oauth-setup.md` added as the RBP submission reference (fields, use case, subreddits, volume, data handling, compliance).
  - 12 new tests (157 total): Reddit OAuth graceful-skip / token fetch / 401 retry / fixture short-circuit, Twitter gate timing + reset helper, workflow main-branch guards + Reddit env pass-through.
  - No schema changes, no new sources, no new scraper types, no client-library release. CHANGELOG honesty correction for the v1.4.0 "queue naturally via backoff" claim.
- [x] v1.4.1 release shipped (2026-04-24) — PR #15 merged to `main`, tag `v1.4.1` created, back-merged to `develop`. First scheduled cron run on `main` validated the Twitter spacing gate and rebase-retry loop in production.
- [x] Release automation (2026-04-24, PR #16) — `.github/workflows/release.yml` auto-creates tag + GitHub Release on `pull_request: closed + merged==true + branches: [main]`. Concurrency-gated, idempotent via tag-exists check, awk-extracted CHANGELOG section, `--notes-file` to dodge shell-quote issues, `merge_commit_sha` null-check, `github-actions[bot]` identity. Self-test on PR #16 merge correctly skipped (tag already existed). No scraper code change.
- [x] v1.4.1 docs refresh (2026-04-24, PR #17) — 8 files: `README.md`, `packages/client/README.md`, `docs/WORCLAUDE-INTEGRATION.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CLAUDE.md`, `AGENTS.md`, `docs/reddit-oauth-setup.md`, plus `docs/spec/SPEC.md:7` source-count fix. Removed stale Playwright references, hardcoded source counts, stacked version notes. SPEC.md gained Release Policy bullet for the new workflow.
- [x] Client `@sefaertunc/anthropic-watch-client@1.0.2` (2026-04-28, PR #18) — README polish for npm landing page (relation to scraper hoisted, npm-friendly framing). 1.0.1 was published in the same window (community-category union widening). Paired stale-reference sweep across `docs/ARCHITECTURE.md`, `docs/SOURCES.md`, `docs/FEED-SCHEMA.md`, `docs/ADDING-SOURCES.md`, `docs/TROUBLESHOOTING.md`. No scraper code change.
- [x] Scaffolding upgrade (2026-04-24 → 2026-04-28) — worclaude `.claude/` scaffolding 2.6.3 → 2.7.1 → 2.9.0 (PR #19). Internal tooling only.
- [x] v1.4.2 — Feed-truncation fix (2026-04-28, PR #21) — Diagnosed and fixed silent feed-accumulation bug present since v1.0.0. The published JSON/RSS feeds at `https://sefaertunc.github.io/anthropic-watch/feeds/` had been resetting to "today's new items only" each day instead of the rolling 100/50-item windows documented in `docs/FEED-SCHEMA.md`. Live evidence: `feeds/all.json` on 2026-04-21 contained 37 items spanning 6 months; on 2026-04-28 it contained 28 items spanning 4 days (items lost, not a superset). Root cause: `scrape.yml` checked out `main` only; `public/feeds/*` lives on `gh-pages`; `readJsonSafe` at `src/index.js:191,226,269` returned `null` on every CI run; `peaceiris/actions-gh-pages@v4` then overwrote the gh-pages copy with the truncated result. Fix: insert two steps between `Install dependencies` and `Run scraper` — `actions/checkout@v4 ref: gh-pages` into a sibling path with `continue-on-error: true`, then `cp -r` into `public/feeds/`. First-run-after-deploy and forks-without-gh-pages handled cleanly via the existence check + continue-on-error. Two new tests catch the disk-persistence boundary the existing merge-unit test skipped: workflow structural assertion + e2e two-runs-shared-feedsDir accumulation test (159/159 passing). Historical items lost (October 2025 → April 2026) will not be backfilled; rolling windows seed fresh from this point. No `src/`, schema, or scraper changes.
- [x] v1.4.2 release shipped (2026-04-28, PR #22) — First end-to-end live-fire of `release.yml`. Tag `v1.4.2` auto-created by `github-actions[bot]` at 11:10 UTC on the develop → main release PR merge; CHANGELOG `[1.4.2]` section extracted via awk and posted as the GitHub Release body verbatim. Concurrency gate, idempotency check, `--notes-file` shell-quote workaround, and `merge_commit_sha` null-check all behaved as designed. Release-automation contract is now proven against a real version cut.
- [x] Scaffolding upgrade 2.9.0 → 2.10.1 + per-PR Version bump workflow adoption (2026-04-30, PR #23) — Selective merge of 22 worclaude 2.10.1 templates per PR #19's pattern. Adopted the new per-PR Version bump declaration workflow (`/commit-push-pr` non-skippable AskUserQuestion + `/sync` max-precedence aggregation), SHA-based session tracking (`sha:` line in session summaries; `/start` SHA-based drift with date fallback), `/end` handoff/summary split + push consent, `/review-changes` ↔ `/refactor-clean` SHA-stamped scratch artifact handoff, `/verify` scope locked to fast read-only test+lint, `/build-fix` 3-attempt bug-fixer escalation, `/setup` state-machine rewrite (131 → 834 lines), `claude-md-maintenance` 200-line target + `@import` + worktree-share, `subagent-usage` `origin/HEAD` gotcha (`ci-fixer` preserved in worktree-isolated list), `upstream-watcher` agent migrated to client lib. CLAUDE.md gained Critical Rule 13 (slash-command invocation contract) and reworded Project-Specific Rule 12 for per-PR aggregation. No scraper, schema, or source-list changes; tests 159/159.

## In Progress

None — no active feature work. Operational watch items in Next Steps.

## Next Steps

1. Reddit Responsible Builder Policy application — submit via Reddit's Developer Support form using `docs/reddit-oauth-setup.md` as the field reference. Add `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` as repo secrets once approval lands. Sources remain in graceful-skip until then. Remote routine `trig_012EHpWTm2hU7jK2wdWKk2Fi` checks in on 2026-05-01.
2. Watch the dashboard and run-report for sources with `consecutiveFailures > 0` — signal for scraper rot (site redesigns, policy changes, API shape drift).
3. Monitor the first scheduled cron run on `main` after the v1.4.2 fix for the `Hydrated N feed files from gh-pages` log line and confirm `feeds/run-history.json` accumulates beyond 1 entry. The first post-fix gh-pages commit will be larger than steady-state (bounded: `all.json` up to 100 items, per-source up to 50 each).
4. Continue source additions as new public Anthropic surfaces appear. Follow the pattern in `.claude/skills/project-patterns/SKILL.md` and `docs/ADDING-SOURCES.md`.
5. v2.0 RSS `guid` composite-key change is scheduled for the next envelope-version bump — not before. Any v1.x.y release must keep `guid` as bare `id`.
6. Subpackage CI job (`cd packages/client && npm ci && npm test` in a matrix step) remains deferred — pick up in a patch release if `packages/client/` changes start slipping through without coverage.

## Blockers

None.

## Notes

- `SCRAPER_PAT` repo secret must exist with `repo` + `workflow` scopes. Without it the scraper job fails at checkout.
- The first scheduled run after any new-source PR emits a backfill burst — that's expected, not a regression.
