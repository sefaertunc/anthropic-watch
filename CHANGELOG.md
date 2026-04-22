# Changelog

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
