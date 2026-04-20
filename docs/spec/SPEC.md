# SPEC.md — anthropic-watch

## Product Overview

anthropic-watch is a GitHub Actions–powered scraper that monitors public Anthropic sources (blogs, GitHub releases, npm registry, docs, status page) on a daily cron, detects new content by diffing against persisted state, and publishes structured RSS, JSON, and OPML feeds via GitHub Pages.

No server, no database — just static feeds anyone can subscribe to. The current source count is tracked in `docs/SOURCES.md` and the README badge; as of v1.1.0 it is 17 sources across 6 scraper types.

### Audience

- **Primary:** developers building on Claude Code who need upstream change visibility (same audience as Worclaude, the canonical downstream consumer).
- **Secondary:** researchers, journalists, dev-tool builders, and RSS users tracking Anthropic who want one feed instead of bookmarking many pages.

### Problem

Anthropic ships fast across many surfaces (blog, engineering blog, research, multiple GitHub repos, npm, docs, status, support) with no unified feed. Manually checking each daily isn't viable; missing a Claude Code release or breaking SDK change has real downstream cost. anthropic-watch consolidates everything into one diff-based feed so consumers only see genuinely new items.

## Non-Goals

- **No browser automation.** All HTML uses `fetch` + `cheerio`. If a source requires JS rendering, solve it with a new parse mode (RSC extraction, API discovery), not a headless browser.
- **No authenticated Anthropic surfaces.** Public web only; no API keys, no Console, no billing, no logged-in pages.
- **No npm publish.** Ships as GitHub Releases; it is infrastructure, not a package.
- **No paid dependencies.** Every source must be fetchable from a stock GitHub Actions runner with only `GITHUB_TOKEN`.
- **No database or backing service.** State lives in a JSON file committed to `main`; feeds are static files on GitHub Pages.

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

Canonical schemas live in `docs/FEED-SCHEMA.md`. The item shape (8 fields: `id`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`) is part of the public contract — consumers like Worclaude depend on it. Schema version is `"1.0"`; additive changes don't bump it, breaking changes do.

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

## Release Policy

- **Semantic versioning.** `package.json` `version` is the source of truth; User-Agent header derives from it at module load.
- **CHANGELOG.md** is updated in the release commit for every user-visible change.
- **Tagged GitHub Releases** are how versions ship; no npm publish.
- **Feed schema version** (`"1.0"` in every output file) bumps only on breaking changes. See `docs/FEED-SCHEMA.md — Versioning Policy`.

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

### Phase 3 — Source Growth (in progress as of v1.1.0, 2026-04-20)

- [x] `api-sdk-py-releases` added (17 sources total)
- [x] Branch-name enforcement workflow (merged 2026-04-16)
- [ ] Continue source additions as new public Anthropic surfaces appear

### Phase 4 — Future / Conditional

Only pursued if a concrete need emerges — not planned speculatively.

- Automated "live drift" detection (currently an accepted gap — consecutive-failure tracking + dashboard amber/red dots are considered sufficient)
- Stronger browser testing for the dashboard (currently manual inspection only)
- Additional downstream consumers beyond Worclaude

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
