# SPEC.md — anthropic-watch

## Product Overview

anthropic-watch is a GitHub Actions–powered scraper that monitors public Anthropic sources (blogs, GitHub releases, npm registry, docs, status page) on a daily cron, detects new content by diffing against persisted state, and publishes structured RSS, JSON, and OPML feeds via GitHub Pages.

No server, no database — just static feeds anyone can subscribe to. The current source count is tracked in `docs/SOURCES.md` and the README badge. As of v1.4.0 the repo monitors 37 sources across three categories (Core, Extended, Community) and ten scraper types.

### Audience

- **Primary:** developers building on Claude Code who need upstream change visibility (same audience as Worclaude, the canonical downstream consumer).
- **Secondary:** researchers, journalists, dev-tool builders, and RSS users tracking Anthropic who want one feed instead of bookmarking many pages.

### Problem

Anthropic ships fast across many surfaces (blog, engineering blog, research, multiple GitHub repos, npm, docs, status, support) with no unified feed. Manually checking each daily isn't viable; missing a Claude Code release or breaking SDK change has real downstream cost. anthropic-watch consolidates everything into one diff-based feed so consumers only see genuinely new items.

## Non-Goals

- **No browser automation.** All HTML uses `fetch` + `cheerio`. If a source requires JS rendering, solve it with a new parse mode (RSC extraction, API discovery), not a headless browser.
- **No authenticated Anthropic surfaces.** Public web only; no API keys, no Console, no billing, no logged-in pages.
- **No npm publish for the scraper.** The scraper ships as GitHub Releases; it is infrastructure, not a package. The sibling `@sefaertunc/anthropic-watch-client` library at `packages/client/` IS published to npm — but that is a separately-versioned product (see Repository Layout and Release Policy), not the scraper itself.
- **No paid dependencies for `core` or `extended` sources.** Every core/extended source must be fetchable from a stock GitHub Actions runner with only `GITHUB_TOKEN`. `community`-category sources MAY use a credential-gated third-party API (paid or free) **iff** (1) the scraper implements graceful-skip-on-missing-credential — absent credentials return `[]` without throwing and without incrementing `consecutiveFailures`; (2) any monthly cost at documented volume is declared in the CHANGELOG and in the source's prose documentation; (3) forks of the repository, and local dev sessions without the credential, continue to work — the scraper MUST NOT fail when the key is absent. Current instances: `twitterapi.io` (paid, ≈$0.36/month, added v1.4.0) and `oauth.reddit.com` (free, Reddit Responsible Builder Policy-gated OAuth2 client_credentials, added v1.4.1 to bypass Reddit's datacenter-IP filter on anonymous endpoints). Adding another paid third-party API requires a new SPEC revision; adding another free credential-gated API requires only a CHANGELOG entry and the graceful-skip pattern.
- **No database or backing service.** State lives in a JSON file committed to `main`; feeds are static files on GitHub Pages.
- **No workspace tooling in the monorepo.** No Turborepo, Nx, Lerna, pnpm workspaces, or npm workspaces. Two packages do not justify the weight; cross-package coordination is manual and deliberate.

## Architecture at a Glance

```
Daily cron (06:00 UTC) in .github/workflows/scrape.yml
  └─ node src/cli.js
       └─ runPipeline()  [src/index.js]
            ├─ loadState()                           state/last-seen.json
            ├─ Build scraper tasks from sources.js
            ├─ runWithConcurrency(tasks, 4)          Promise.allSettled
            ├─ Diff results vs. knownIds            isNew / markSeen
            ├─ Generate feeds                       feed/json.js, rss.js, opml.js
            │    ├─ public/feeds/all.{json,xml}      (max 100)
            │    ├─ public/feeds/{key}.{json,xml}    (max 50 each)
            │    ├─ public/feeds/sources.opml
            │    ├─ public/feeds/run-report.json
            │    └─ public/feeds/run-history.json    (max 90)
            ├─ saveState()
            └─ Commit state back to main + deploy public/ to gh-pages
```

See `docs/ARCHITECTURE.md` for the complete deep-dive: scraper contract, concurrency model, retry logic, state management, failure detection, and testing architecture. That document is authoritative — this SPEC points to it rather than duplicating.

## Repository Layout

As of v1.3.0 this is a two-package monorepo:

| Package                              | Location           | Shipping                                                  | Versioning                                            |
| ------------------------------------ | ------------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| `anthropic-watch` (scraper)          | repo root          | GitHub Releases only; runs on GitHub Actions cron         | SemVer (root `package.json`)                          |
| `@sefaertunc/anthropic-watch-client` | `packages/client/` | Published to npm as a scoped package; zero deps; Node 18+ | SemVer independently (`packages/client/package.json`) |

The scraper remains the primary entry point — someone landing on the repo sees infrastructure first, with the client clearly labeled as a subdirectory. The client library encapsulates the feed consumption contract (version gating, composite-key dedup, typed errors) so downstream consumers don't each reinvent it.

## Tech Stack

| Concern      | Choice                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| Runtime      | Node.js 20+, ESM, plain JavaScript                                            |
| HTTP         | Global `fetch` + `src/fetch-with-retry.js` wrapper                            |
| HTML parsing | `cheerio`                                                                     |
| XML/OPML     | `fast-xml-parser`                                                             |
| Tests        | `vitest` + fixture injection via `src/fetch-source.js`                        |
| CI/CD        | GitHub Actions (`scrape.yml`, `test.yml`, `branch-name-check.yml`)            |
| Hosting      | GitHub Pages (via `peaceiris/actions-gh-pages@v4`)                            |
| Secrets      | `SCRAPER_PAT` (repo + workflow scopes) — required for cross-workflow triggers |

## Data Shapes

Canonical schemas live in `docs/FEED-SCHEMA.md`. The item shape is part of the public contract — consumers like Worclaude depend on it. Required fields: `id`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`. As of v1.2.0 a pre-computed `uniqueKey` (`${id}|${source}`) is also emitted on every new item; it is `Nullable=Yes` in the Field Guarantees table because archived pre-v1.2.0 feeds predate it, and consumers handle absence via the documented fallback. Schema version is `"1.0"`; additive changes don't bump it, breaking changes do.

## Scraper Types

| Type               | File                               | Method                                                                 |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| `github-releases`  | `src/scrapers/github-releases.js`  | GitHub REST API (`/repos/:o/:r/releases`)                              |
| `github-changelog` | `src/scrapers/github-changelog.js` | GitHub Contents API + base64 decode                                    |
| `npm-registry`     | `src/scrapers/npm-registry.js`     | npm registry (`/latest` + full doc)                                    |
| `blog-page`        | `src/scrapers/blog-page.js`        | fetch + cheerio (`nextjs-rsc`, `webflow`, `distill` modes)             |
| `docs-page`        | `src/scrapers/docs-page.js`        | fetch + cheerio (`intercom-article`, `docs-hash`, `model-table` modes) |
| `status-page`      | `src/scrapers/status-page.js`      | Statuspage.io REST API                                                 |

Full source list and detection methods: `docs/SOURCES.md`.

## Downstream Consumers

The canonical consumer is **Worclaude**; integration details in `docs/WORCLAUDE-INTEGRATION.md`. Consumers fetch `run-report.json` for status and `all.json` (or per-source feeds) for items. The feed files are the interface — there is no API, webhook, or direct integration.

The recommended path for new JavaScript/TypeScript consumers is the **official client library** `@sefaertunc/anthropic-watch-client` (see `packages/client/README.md`). It encapsulates the consumption contract: version gating, composite-key deduplication with `${id}|${source}` fallback, and typed errors. Non-JS consumers continue to use the raw JSON feeds directly; `docs/FEED-SCHEMA.md` Programmatic Consumption remains the canonical hand-rolled reference and is now enforced in CI by a drift-protection test that extracts the inline example and runs it against the reference fixture.

## Release Policy

Two independent versioning tracks:

**Scraper** (root `package.json`):

- **Semantic versioning.** Root `package.json` `version` is the source of truth; User-Agent header derives from it at module load.
- **CHANGELOG.md** (root) is updated in the release commit for every user-visible change.
- **Tagged GitHub Releases** are how scraper versions ship. Never published to npm.
- **Release automation.** The tag and GitHub Release are created automatically by `.github/workflows/release.yml` when a pull request merges to `main`. The workflow reads `package.json` version, extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md`, tags the merge commit, and publishes the release. Requires only default `GITHUB_TOKEN` — no additional secrets. Idempotent: a PR that does not bump version (docs-only, workflow changes, etc.) merges as a no-op. Version bumping in `package.json` and the `CHANGELOG.md` entry remain manual release-PR steps.
- **Feed schema version** (`"1.0"` in every output file) bumps only on breaking changes. See `docs/FEED-SCHEMA.md — Versioning Policy`.

**Client library** (`packages/client/package.json`):

- **Semantic versioning, independent of the scraper.** Scraper v1.3.0 shipped alongside client v1.0.0; they are not locked together after that.
- **Separate CHANGELOG** at `packages/client/CHANGELOG.md` — internal to the package and shipped in the published tarball.
- **npm publish** as a scoped package with `--access public`. Release engineer runs `npm publish` manually from `packages/client/` after the scraper release PR merges; CI does not publish.
- **Feed version support is version-gated at the library level.** The library declares which feed envelope version it speaks (currently `"1.0"`); any other version throws `FeedVersionMismatchError`. When the feed bumps to `"2.0"` a new major of the client library will ship supporting it.

## Implementation Phases

### Phase 1 — Foundation (complete as of v1.0.0, 2026-04-16)

- [x] Core pipeline: orchestrator, 6 scraper types, state management
- [x] Feed generation: JSON, RSS 2.0, OPML 2.0, run-report, run-history
- [x] 16 initial sources across Core/Extended tiers
- [x] Vitest suite: unit, per-scraper, e2e, with fixture injection
- [x] GitHub Actions workflows: daily cron, test, Pages deploy
- [x] Dashboard (`public/index.html`) — vanilla HTML + DOM APIs
- [x] Consumer-facing docs: ARCHITECTURE, SOURCES, FEED-SCHEMA, WORCLAUDE-INTEGRATION, ADDING-SOURCES, TROUBLESHOOTING

### Phase 2 — Hardening (complete as of v1.0.1, 2026-04-16)

- [x] Scraper error propagation fix (no more silent failures)
- [x] First-run failure detection fix
- [x] `github-changelog` ID stability (heading-derived, not whole-file hash)
- [x] `docs-release-notes` stabilized via new `model-table` parse mode
- [x] `fetchWithRetry`: retry on 429 with `Retry-After` honoring
- [x] Dashboard XSS hardening (`safeUrl`, `textContent`/`createElement`)
- [x] Workflow: rebase-retry push loop to survive cron races
- [x] Docs: `nextjs-rsc` brittleness, feed merge semantics

### Phase 3 — Source Growth (complete as of v1.1.0, 2026-04-20)

- [x] `api-sdk-py-releases` added (17 sources total)
- [x] Branch-name enforcement workflow (merged 2026-04-16)
- [ ] Continue source additions as new public Anthropic surfaces appear

### Phase 4 — Schema Hardening (complete as of v1.2.0, 2026-04-22)

- [x] `uniqueKey` field on every JSON feed item (`${id}|${source}`), Nullable=Yes for archived-feed compatibility
- [x] Consumer Expectations classification (primary vs. observability) in `docs/FEED-SCHEMA.md`
- [x] Rewritten Programmatic Consumption example with version gating + composite-key dedup + state persistence
- [x] Reference fixtures shipped at `docs/fixtures/`
- [x] Hardcoded source counts removed from README body, OPML doc, and prose docs (badge switched to non-numeric `sources-monitored`)
- [x] Forward-looking v2.0 RSS `guid` deferral note
- [ ] v2.0 envelope-version bump + RSS `guid` composite-key change (scheduled for future release)

### Phase 5 — Client Library (complete as of v1.3.0, 2026-04-23)

- [x] Monorepo restructuring: `packages/client/` sibling to the scraper; no workspace tooling introduced
- [x] `@sefaertunc/anthropic-watch-client@1.0.0` — zero-dep, ESM-only, Node 18+. Class + pure helpers + typed error hierarchy + constants
- [x] JSDoc-sourced TypeScript types via `tsc --emitDeclarationOnly` at publish; `dist/index.d.ts` surfaces `Item`/`FeedEnvelope`/`RunReport` to consumers
- [x] 53 client tests — mocked fetch for class, byte-identity check on fixtures against `docs/fixtures/`, drift-protection test that extracts the FEED-SCHEMA Programmatic Consumption example and runs it against the reference fixture
- [x] FEED-SCHEMA Programmatic Consumption example restructured to export `async function run(seenSet)` (enforced by the drift test)
- [x] Root `vitest.config.js` excludes `packages/**` so scraper test command is unchanged
- [x] One-time `test.yml` `pull_request` trigger expansion to `[develop, main]`
- [x] Scraper-side documentation pointers: `docs/FEED-SCHEMA.md` recommended-path note, `README.md` "For consumers" section, `docs/WORCLAUDE-INTEGRATION.md` handshake note, `docs/TROUBLESHOOTING.md` consumer-side duplicates pointer
- [ ] Subpackage CI job (matrix step installing + testing `packages/client/` in CI) — deferred to v1.3.1 if it becomes friction

### Phase 6 — Community Sources (complete as of v1.4.0, 2026-04-23; production fixes in v1.4.1, 2026-04-24)

- [x] Four new scraper types: `github-commits` (direct-commit activity on commits-only repos), `reddit-subreddit` (public Reddit JSON, upgraded to OAuth2 in v1.4.1), `hn-algolia` (HN search), `twitter-account` (twitterapi.io)
- [x] New `community` source category — third value joining `core` and `extended`. Dashboard renders as a third group; OPML feed emits a third `Community` outline group.
- [x] 20 new sources (17 → 37 total): 6 GitHub-commits, 5 Reddit subs, 1 HN filter, 8 Twitter handles. All handles verified active and on-topic via live API at implementation time.
- [x] `TWITTERAPI_IO_KEY` GitHub Actions secret (optional) with graceful-skip semantics in the Twitter scraper — forks and local dev sessions without the credential continue to work.
- [x] Paired client release `@sefaertunc/anthropic-watch-client@1.0.1` widening both `Item.sourceCategory` and `SourceResult.category` TypeScript unions to include `'community'`.
- [x] Feed schema extensibility policy formalized — the set of category values is open; new values may be added in minor releases; consumers must handle unknown values gracefully (Source Categories section of `docs/FEED-SCHEMA.md`).
- [x] `src/github-auth.js` (`githubHeaders()`) helper extracted to eliminate 3× duplication across GitHub scrapers.
- [x] v1.4.1 production fixes: Reddit OAuth2 (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — free, Responsible Builder Policy-gated) to bypass Reddit's datacenter-IP filter; Twitter module-scope `waitForSlot()` gate pacing calls to 1 req / 6 s for twitterapi.io free-tier compliance; workflow `scrape.yml` hardened with stash-and-resync state-commit retry and `if: github.ref == 'refs/heads/main'` guards so feature-branch preflights stay read-only.

### Phase 7 — Feed-health observability (complete as of v1.5.0, 2026-04-30)

- [x] `public/feeds/feed-health.json` — new published artifact, schemaVersion `"1.0"`, generated every cron run alongside existing feeds. Hydrated and deployed for free by the v1.4.2 mechanism. Four indicators (`runHistoryDepth`, `allJsonItemCount`, `perSourceFeedContinuity`, `cronFreshness`) with three severity states (`ok` / `warning` / `fired`).
- [x] `src/feed/health.js` — pure async `computeFeedHealth` reading already-on-disk artifacts plus the previous run's envelope and per-source baseline. Per-source continuity uses item-membership (not count-only) so cap-saturated 50-item feeds are correctly checked. `cronFreshness` publishes inputs only — state computed at read time because a stale envelope cannot self-report staleness.
- [x] Orchestrator wiring in `src/index.js` runs as the LAST pipeline step, after `saveState` and the GHA `has_new_items` output. Wrapped in try/catch (Rule-4 carve-out for observability code) — failure emits a degenerate envelope and never breaks feed publishing. Verified by `test/e2e/feed-health-isolation.test.js`.
- [x] Dashboard "Feed Health" section at the top of `public/index.html` rendered by `public/health-render.js` (ESM module with named exports for direct vitest unit testing without JSDOM). Server/client `aggregateOverall` parity locked by `test/fixtures/aggregate-cases.json` and a fail-CI-on-drift parity test.
- [x] `src/read-json-safe.js` — extracted shared helper, was duplicated between `src/index.js` and `src/feed/health.js`.
- [x] Schema-version policy formalized: additive minor for new indicators, optional fields, and state values; `summary.byState` is an open map. `summary.serverOverall` excludes `cronFreshness` by design (named for honesty); consumers merge in the read-time cron-freshness state — canonical 5-line example in `docs/FEED-SCHEMA.md`.
- [x] Scope ceiling held: no Slack, email, webhooks, GitHub-Issue auto-opening — v1.5 publishes the structured signal and the documented merge pattern; consumers compose the alerting layer.
- [ ] Client library `fetchFeedHealth()` — deferred until the `feed-health.json` schema settles in production for ≥2 weeks of real cron runs. Then ship as `@sefaertunc/anthropic-watch-client@1.0.4` (or wherever the version lands).

### Phase 8 — Future / Conditional

Only pursued if a concrete need emerges — not planned speculatively.

- Automated "live drift" detection for the scraper (currently an accepted gap — consecutive-failure tracking + dashboard amber/red dots are considered sufficient)
- Stronger browser testing for the dashboard (currently manual inspection only)
- Additional downstream consumers beyond Worclaude (the client library now lowers the cost of each new consumer)
- Subpackage CI job (matrix step installing + testing `packages/client/` in CI) — still deferred; pick up if `packages/client/` changes begin slipping through without coverage
- External alerting layer wrapping `feed-health.json` (Slack/email/GitHub-Issue auto-open). The seam exists in the JSON shape — consumers merge `summary.serverOverall` with the read-time cron-freshness state and post when `"fired"`. v1.5.x or v1.6 candidate if a concrete need emerges.

## Accepted Limitations

- **Fixtures lag reality.** Tests pass against captured HTML/JSON; there is no automated check that parsers still match live Anthropic output. The failure surface (per-source `consecutiveFailures` + dashboard amber/red dots + job summary warnings at 3+ failures) is considered sufficient.
- **No staging environment.** The production GitHub Pages site is the only deployment target; PRs are validated via `test.yml` against fixtures, and the first scheduled run after merge is the real live validation.
- **Dashboard has no automated tests.** One static HTML file with vanilla DOM APIs — complexity is low enough that manual inspection plus code review catches issues. Security-sensitive changes (anything touching `innerHTML`, URL handling, user-controlled rendering) require an explicit review note.

## Verification Strategy

For agents working on this repo:

1. **Unit/scraper/e2e tests:** `npm test` — must pass.
2. **Scraper changes against live data:** `npm run test:live` to refresh the relevant fixture, then `npm test`, then `node src/cli.js` with `GITHUB_TOKEN` set and inspect `public/feeds/{key}.json` for plausible output.
3. **Dashboard changes:** open `public/index.html` in a browser after a local pipeline run.
4. **First scheduled run after merge is the production validation** — a new source with `consecutiveFailures > 0` is the signal something broke in the live capture.
