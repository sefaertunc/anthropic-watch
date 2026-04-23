# Changelog

## [1.4.0] - 2026-04-23

The largest source expansion since v1.0.0. Adds four new scraper types, twenty new community sources, and the `community` source category for third-party signal. Triggers a paired `@sefaertunc/anthropic-watch-client@1.0.1` release widening the `sourceCategory` type union.

### Added

- **`github-commits` scraper type** monitors direct commits on GitHub repositories that ship via commits rather than tagged releases. Includes bot-author filtering (`*[bot]` login suffix), with per-source `excludeBots: false` escape hatch for noisy repos.
- **`reddit-subreddit` scraper type** monitors subreddit posts via Reddit's public JSON endpoint. Supports `top` / `new` / `hot` modes, time window selection, score floor. User-Agent derived from root `package.json` version per Reddit's public-API guidance.
- **`hn-algolia` scraper type** monitors Hacker News via the HN Algolia public search API. Query-based. Logs info-line on zero-hit responses so silently-broken queries are visible in run output.
- **`twitter-account` scraper type** monitors Twitter/X accounts via the [twitterapi.io](https://twitterapi.io) API. **Graceful-skip when `TWITTERAPI_IO_KEY` is unset** — the scraper returns `[]` without attempting any fetch, so forks and local dev sessions work without configuring the paid credential. Every other failure mode (401, 403, 429, 5xx, network, parse) throws per Rule 4. Projected cost ≈ $0.36/month at current volume.
- **New `community` source category** for third-party sources. Joins `core` and `extended`. Intended for informational signal; consumers should treat as lower-reliability than first-party sources. Dashboard renders as a third group below Core/Extended.
- **Twenty new community sources** (17 → 37 total):
  - **GitHub commits (6)**: `anthropics/claude-cookbooks`, `anthropics/skills`, `anthropics/claude-plugins-official`, `anthropics/claude-code` (pre-release signal — composite `uniqueKey` prevents collision with the existing `npm-claude-code` release signal), `affaan-m/everything-claude-code`, `sickn33/antigravity-awesome-skills`.
  - **Reddit (5)**: `r/ClaudeCode`, `r/ClaudeAI`, `r/claude`, `r/claudeskills`, `r/Claudeopus` (uses `mode: "new"` with `minScore: 20` for low-traffic substantive-post detection).
  - **Hacker News (1)**: anthropic.com / claude.ai / claude.com mentions.
  - **Twitter / X (8)**: `@AnthropicAI`, `@claudeai`, `@ClaudeDevs`, `@bcherny`, `@TheAmolAvasare`, `@felixrieseberg`, `@noahzweben`, `@janleike`. All verified active and on-topic via live twitterapi.io API at implementation time.
- **`TWITTERAPI_IO_KEY` GitHub Actions secret** (optional). Scraper gracefully returns `[]` when absent.
- **`src/github-auth.js`** (`githubHeaders()`) extracted to eliminate 3× header-construction duplication across GitHub scrapers.
- **OPML feed now emits a third `Community` outline group**. Previously silently dropped community-category sources.
- **Feed schema extensibility policy** formalized in `docs/FEED-SCHEMA.md` — the set of `sourceCategory` values is open; new values may be added in minor releases; consumers must handle unknown values gracefully.
- Three new `docs/TROUBLESHOOTING.md` entries (Reddit 403, Twitter 0 items, GitHub commits missing human-authored commit).

### Changed

- `public/index.html` dashboard renders a third `Community` group in the source table. Matches the existing grouped-sub-header pattern — no new filter UI, no layout changes.
- `.github/workflows/scrape.yml` now passes `TWITTERAPI_IO_KEY` to the scraper step (one-line env addition; only workflow-file change in v1.4.0).
- `src/feed/opml.js`: `generateOpml()` now takes an optional `sources` argument for testability (default remains the imported sources list).
- `docs/spec/SPEC.md` Non-Goals refined: paid third-party APIs are acceptable for `community`-category sources when they implement graceful-skip-on-missing-credential, cost is documented, and the source functions with or without the credential. twitterapi.io is the sole current instance.

### Migration

No migration required for existing consumers. The feed envelope version remains `"1.0"`. Consumers that treat `sourceCategory` as an open/extensible field (the documented contract) need no changes. Consumers with strict two-value enumerations must widen to include `"community"` or, better, handle unknown values gracefully.

TypeScript consumers of the client library: update to `@sefaertunc/anthropic-watch-client@1.0.1` (shipped simultaneously) for the widened type union covering both `Item.sourceCategory` and `SourceResult.category`.

### Notes

- First scheduled cron run after this release will emit a backfill burst — each of the 20 new sources emits its initial limit (mostly 10–20 items). Expected, not a regression; matches the precedent of v1.1.0 and prior source-addition releases.
- Twitter free-tier rate limit is 1 req / 5 s. `fetchWithRetry` honors `Retry-After` on 429s; under `runWithConcurrency(4)` the 8 Twitter sources queue naturally via backoff. No special handling required.

## [1.3.0] - 2026-04-23

A monorepo restructuring release introducing the first-party consumer SDK. The scraper is unchanged — no source additions, no scraper logic changes, no feed schema changes. The new `@sefaertunc/anthropic-watch-client` package ships at 1.0.0 simultaneously, published separately to npm.

### Added

- **`packages/client/` directory** containing the new `@sefaertunc/anthropic-watch-client` package. Published to npm as version `1.0.0`. Zero runtime dependencies, Node 18+ required. Encapsulates the v1.2.0 `uniqueKey` consumption pattern — version gating, composite-key deduplication with `${id}|${source}` fallback, typed error hierarchy (`AnthropicWatchError`, `FeedVersionMismatchError`, `FeedFetchError`, `FeedMalformedError`) — so consumers don't each reinvent it.
- **Client library documentation pointers** in `docs/FEED-SCHEMA.md` (pointer note prepended to "Programmatic Consumption" recommending the npm package) and `README.md` ("For consumers" section).
- **Drift-protection test** at `packages/client/test/docs-example.test.js` that extracts the `docs/FEED-SCHEMA.md` Programmatic Consumption JavaScript example, executes it against the reference fixture with a mocked fetch and in-memory seen-set, and asserts the two-run dedup invariant. If the inline example diverges from library behavior, CI fails.
- **Fixture-identity test** at `packages/client/test/fixtures.test.js` asserting byte-equality between the subpackage's fixture copies and `docs/fixtures/*.sample.json`, so producer fixture regeneration forces client-side re-copy in the same PR.
- **Handshake note** in `docs/WORCLAUDE-INTEGRATION.md` naming the npm package and flagging Worclaude v2.6.0 migration as separately tracked.
- **Consumer-side duplicates troubleshooting pointer** in `docs/TROUBLESHOOTING.md` distinguishing scraper-side from consumer-side `id`-only dedup bugs.

### Changed

- **Repository is now a monorepo.** Root remains the scraper as before; `packages/client/` is the new sibling. No workspace tooling (Turborepo, Nx, pnpm workspaces, npm workspaces) was introduced — cross-package coordination is manual and deliberate.
- **Root `package.json` version bumped to `1.3.0`.** The scraper continues to version independently of the client (client at `1.0.0`, scraper at `1.3.0`).
- **Root `vitest.config.js` added** excluding `packages/**` so `npm test` at the repo root continues to run only the scraper suite. The client runs via `cd packages/client && npm test`.
- **`docs/FEED-SCHEMA.md` Programmatic Consumption example restructured** to export `async function run(seenSet)`. Driver code (read state, call `run`, persist) remains for non-JS consumers and evaluators. The restructuring enables the drift-protection test to drive the example directly against a shared seen-set across two simulated runs.
- **`.github/workflows/test.yml`** `pull_request` triggers expanded from `[main]` to `[develop, main]`. One-time carve-out; only workflow change in this release.

### Migration

No migration required for existing anthropic-watch feed consumers — the scraper output is byte-for-byte identical to v1.2.0. Consumers interested in adopting the client library can run `npm install @sefaertunc/anthropic-watch-client` and follow the patterns in that package's README.

## [1.2.0] - 2026-04-22

A minor release addressing schema documentation and contract gaps surfaced by the integration audit of Worclaude's `anthropic-watch` consumer. JSON feed changes are strictly additive — non-breaking for existing consumers. The feed envelope `version` stays `"1.0"` because the new `uniqueKey` field is optional (may be absent in archived pre-v1.2.0 feeds), fitting the Versioning Policy's "new optional fields" exemption.

### Added

- **`uniqueKey` field on every JSON feed item** — pre-computed `${id}|${source}` composite key. Consumers can now deduplicate directly using this field instead of reconstructing the composite key themselves. Prevents the class of bug where consumers dedupe on `id` alone and collide across sources. This is additive; existing consumers are unaffected.
- **Reference fixtures** at `docs/fixtures/all.sample.json` and `docs/fixtures/run-report.sample.json`, with provenance documented in `docs/fixtures/README.md`. Consumers can pin against these for contract testing.
- **"Consumer Expectations" subsection** in `docs/FEED-SCHEMA.md` classifying fields as primary (load-bearing, version-bumped on change) vs observability (may change freely).

### Changed

- **`docs/FEED-SCHEMA.md` "Programmatic Consumption" example rewritten** to demonstrate version gating, composite-key dedup with a `uniqueKey ?? \`${id}|${source}\`` fallback, and state persistence. Previous example showed only a slice of items; new example is a full consumer template.
- **Hardcoded source counts removed from README body copy and prose docs** (`docs/FEED-SCHEMA.md` OPML section, `docs/SOURCES.md`, `docs/ARCHITECTURE.md`, `docs/WORCLAUDE-INTEGRATION.md`). The README sources badge was also updated from a numeric count to a non-numeric `sources-monitored` label. Consumers should derive counts from `summary.sourcesChecked` or `sources.length` in `run-report.json`.
- `package.json` version bumped to `1.2.0`.

### Deferred

- **RSS `guid` composite-key change deferred to v2.0.** Switching `guid` from the bare `id` to `${id}|${source}` in a point release would cause every RSS reader to treat every existing feed item as new on the first post-release sync, across `all.xml` and each per-source feed. That blast radius is inappropriate for a point release. The change is batched with the next envelope `version` bump to `"2.0"`, where consumers will be explicitly prepared for schema changes. A forward-looking note now exists in `docs/FEED-SCHEMA.md`.

### Docs

- `docs/FEED-SCHEMA.md` — new `uniqueKey` field documented, new "Consumer Expectations" subsection, rewritten "Programmatic Consumption" example, new "Reference Fixtures" subsection (placed immediately before "Versioning Policy"), source count warning, and a forward-looking note that RSS `guid` will change to composite form in v2.0.
- `docs/WORCLAUDE-INTEGRATION.md` — v1.2.0 consumer note at the top pointing at the rewritten Programmatic Consumption example.

### Migration

No consumer-side migration is required for v1.2.0. Existing consumers that dedupe on `id` alone continue to work (same bug they had before), but are encouraged to switch to `uniqueKey`-based dedup. RSS consumers are unaffected in this release — `guid` output is unchanged. RSS `guid` is planned to change to `${id}|${source}` in a future v2.0 release, at which point the envelope `version` will bump to `"2.0"` and a one-time re-notification of feed items across RSS readers is expected; that change is deliberately deferred to batch with the envelope version bump.

## [1.1.0] - 2026-04-20

A minor feature release adding a single new source. Non-breaking for downstream consumers — `run-report.json` schema stays `"1.0"`, existing source keys and item shape are unchanged. Consumers that iterate `sources[]` by key will automatically pick up the new entry.

### Added

- **New source `api-sdk-py-releases`** tracking GitHub Releases for `anthropics/anthropic-sdk-python`. Uses the existing `github-releases` scraper — zero new scraper code. Symmetric with `api-sdk-ts-releases`, classified as `core`. Brings total sources from 16 to 17.

### Changed

- `package.json` version bumped to `1.1.0`. The User-Agent header derived from it automatically becomes `anthropic-watch/1.1.0 (…)`.
- Documentation updated across `README.md`, `docs/SOURCES.md`, `docs/ARCHITECTURE.md`, and other files referencing the source count.

### Migration

No migration needed. On the next scheduled run, `state/last-seen.json` will gain a new `api-sdk-py-releases` entry automatically, and the first run will emit the 30 most recent Python SDK releases into the feed.

## [1.0.1] - 2026-04-16

A combined patch release bundling three waves of bug fixes, operational hardening, and a dashboard security fix. All changes are non-breaking for downstream (Worclaude) consumers — `run-report.json` schema stays `"1.0"`, `sources[]` is still indexed by `key`, and item shape is unchanged.

### Security

- Dashboard (`public/index.html`) rewrote item/table rendering using DOM APIs (`createElement` + `textContent`) instead of `innerHTML` string templates. Added `safeUrl()` to reject non-`http(s)` protocols (closes a `javascript:` URL XSS surface on `item.url`) and `rel="noopener noreferrer"` on item links.

### Fixed

- **Scraper error propagation.** All 6 scrapers no longer wrap their logic in `try { … } catch { return []; }`. Thrown errors flow through `Promise.allSettled` in the orchestrator, populating `sourceResults[].error` with the real message (e.g. `"HTTP 503 for …"`, `"Unexpected token …"`) instead of the former `"returned 0 items (possible error)"` placeholder.
- **First-run silent failure.** Removed the "0 items + `hasKnownIds`" heuristic that skipped failure detection on a source's first run — a new source whose scraper throws is now correctly recorded with `status: "error"` and `consecutiveFailures: 1`.
- **`github-changelog` false positives.** IDs previously hashed the whole file, so any byte-level edit emitted a phantom "new" item. IDs now derive from the first `## ` heading (e.g. `"2.1.109"`, `"[Unreleased]"`), with a 12-char SHA-256 hash fallback when no heading is present.
- **`docs-release-notes` false positives.** Replaced the full-body hash scraper with a new `model-table` parse mode that emits one item per Claude model, keyed by the "Claude API ID" column (`claude-opus-4-6`, `claude-sonnet-4-6`, …). No more churn on page formatting tweaks.

### Changed

- `fetchWithRetry` retries on HTTP 429 (not just 5xx). When the response includes a `Retry-After` header, its value (in seconds) overrides the default linear backoff for that attempt.
- `fetchWithRetry` default options now set `redirect: "follow"`; `status-page.js` no longer passes it explicitly.
- User-Agent header now tracks `package.json` version (`anthropic-watch/1.0.1 (…)`), derived via `readFileSync` at module load. Was hardcoded `anthropic-watch/0.4`.
- `github-releases` page size bumped from `per_page=10` to `per_page=30`.
- Run-history cap raised from 30 to 90 entries.
- Each `run-history.json` entry now carries `version: "1.0"` as its first field. Consumers should treat missing `version` on pre-v1.0.1 entries as `"1.0"`.

### Workflow

- `.github/workflows/scrape.yml` collapsed to a single `scrape` job (tests already run in `test.yml` on push/PR — the duplicate in-workflow test job was redundant).
- Commit+push step wrapped in a `git pull --rebase origin main && git push` retry loop (3 attempts with 5/10/15s backoff) to survive cron-race push failures.
- Added `public/.nojekyll` as belt-and-braces for GitHub Pages.

### Docs

- New "`nextjs-rsc` Known Brittleness" subsection in `docs/ARCHITECTURE.md` documenting the `self.__next_f.push` framework-internal dependency and the HTML fallback path.
- New "Merge Semantics" subsection in `docs/FEED-SCHEMA.md` formalizing the dedup key (`${id}|${source}`), prepend order, and first-seen-wins conflict rule.
- `docs/TROUBLESHOOTING.md` state-recovery section now documents `git checkout HEAD~N -- state/last-seen.json` as the preferred recovery path over delete-and-rebuild.
- `docs/SOURCES.md`, `docs/ADDING-SOURCES.md` updated for the new scraper error contract and `model-table` parse mode.

### Migration

The first scheduled scrape run after this release will emit a one-shot batch of "new" items as state migrates:

- Three `github-changelog` sources (`claude-code-changelog`, `agent-sdk-ts-changelog`, `agent-sdk-py-changelog`) each emit one phantom new item as their stored hash-based ID is replaced by the heading-derived ID.
- `docs-release-notes` emits ~5 new items (one per current Claude model) as its single hash-based ID is replaced by per-model IDs.

Subsequent runs settle to stable IDs — no further migration churn.

## [1.0.0] - 2026-04-16

### Added

- Initial release of anthropic-watch
- 16 monitored Anthropic sources across 6 scraper types
- GitHub API scrapers for releases and changelogs (claude-code-releases, api-sdk-ts-releases, claude-code-action, claude-code-changelog, agent-sdk-ts-changelog, agent-sdk-py-changelog)
- npm registry scraper for package version tracking (npm-claude-code)
- Blog page scrapers using fetch + cheerio with three parse modes: nextjs-rsc, webflow, distill (blog-engineering, blog-news, blog-research, blog-alignment, blog-red-team, blog-claude)
- Docs page scrapers with intercom-article and docs-hash parse modes (docs-release-notes, support-release-notes)
- Status page scraper using Statuspage.io REST API (status-page)
- SHA-256 content hash change detection for changelogs and docs pages
- URL-based and version-based change detection for blogs and packages
- RSS 2.0 and JSON feed generation with accumulation (last 100 items for all, 50 per-source)
- Per-source individual feeds (JSON + RSS for each of the 16 sources)
- OPML 2.0 file for bulk RSS subscription with Core/Extended grouping
- Run reports with per-source timing, error tracking, and summary statistics
- Rolling run history (last 30 runs) with error details
- GitHub Pages dashboard with source status, recent items, and health badges
- Consecutive failure tracking with warning at 3 failures
- Retry logic with linear backoff (1s, 2s) and 15s timeout per request
- Concurrency-limited scraper execution (limit of 4 via Set-based Promise.race)
- Fixture-based test suite with vitest
- Fixture injection via fetchSource abstraction for deterministic testing
- Fixture capture script for refreshing test data from live sources
- E2E tests for full pipeline, no-changes detection, and error resilience
- Unit tests for feeds, state, date parsing, retry logic, and logging
- Per-scraper tests for all 6 scraper types
- GitHub Actions workflow with daily cron schedule (06:00 UTC)
- GitHub Actions job summary with markdown table and consecutive failure warnings
- Separate CI test workflow on push and pull request
- GitHub Pages deployment via peaceiris/actions-gh-pages
- Bot commit for state persistence (anthropic-watch[bot])
- Comprehensive documentation (6 docs: Architecture, Sources, Feed Schema, Adding Sources, Troubleshooting, Worclaude Integration)
