# anthropic-watch

Monitor 16 Anthropic sources for changes and publish RSS/JSON feeds via GitHub Pages.

## What is this?

anthropic-watch scrapes Anthropic blogs, GitHub repos, npm, docs, and status pages daily. It detects new content, accumulates items into feeds, and deploys everything to a static dashboard. No account needed — just subscribe via RSS or fetch the JSON feeds.

## Subscribe to Feeds

| Format             | URL                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------- |
| RSS (all sources)  | [`feeds/all.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/all.xml)           |
| JSON (all sources) | [`feeds/all.json`](https://sefaertunc.github.io/anthropic-watch/feeds/all.json)         |
| OPML (import all)  | [`feeds/sources.opml`](https://sefaertunc.github.io/anthropic-watch/feeds/sources.opml) |

<details>
<summary>Per-source feeds</summary>

Every source has its own JSON and RSS feed at `feeds/{source-key}.json` and `feeds/{source-key}.xml`. See [docs/SOURCES.md](docs/SOURCES.md) for the full list with links.

</details>

## Monitored Sources

### Core (10)

| Source                            | Key                      | Type             |
| --------------------------------- | ------------------------ | ---------------- |
| Anthropic Engineering Blog        | `blog-engineering`       | blog-page        |
| Anthropic News Blog               | `blog-news`              | blog-page        |
| Anthropic Docs Release Notes      | `docs-release-notes`     | docs-page        |
| Claude Code Changelog             | `claude-code-changelog`  | github-changelog |
| Anthropic Support Release Notes   | `support-release-notes`  | docs-page        |
| Claude Code Releases              | `claude-code-releases`   | github-releases  |
| Claude Code npm Package           | `npm-claude-code`        | npm-registry     |
| Agent SDK TypeScript Changelog    | `agent-sdk-ts-changelog` | github-changelog |
| Agent SDK Python Changelog        | `agent-sdk-py-changelog` | github-changelog |
| Anthropic SDK TypeScript Releases | `api-sdk-ts-releases`    | github-releases  |

### Extended (6)

| Source                      | Key                  | Type            |
| --------------------------- | -------------------- | --------------- |
| Claude Code Action Releases | `claude-code-action` | github-releases |
| Anthropic Alignment Blog    | `blog-alignment`     | blog-page       |
| Anthropic Red Team Blog     | `blog-red-team`      | blog-page       |
| Anthropic Research Blog     | `blog-research`      | blog-page       |
| Anthropic Claude Blog       | `blog-claude`        | blog-page       |
| Anthropic Status Page       | `status-page`        | status-page     |

## How It Works

1. GitHub Actions runs daily at 06:00 UTC (plus manual dispatch)
2. 16 scrapers run with concurrency limit of 4, using `fetch` + `cheerio` for HTML and REST APIs for GitHub/npm/status
3. New items detected by comparing against persisted state (`state/last-seen.json`)
4. Feeds generated with accumulation — items persist across runs until pushed out by limits (100 all, 50 per-source)
5. State committed to `main`, feeds deployed to GitHub Pages via `peaceiris/actions-gh-pages`

## Dashboard

[sefaertunc.github.io/anthropic-watch](https://sefaertunc.github.io/anthropic-watch/) — live status, recent items, and run history.

## Use with Worclaude

anthropic-watch feeds can be consumed by Worclaude for upstream change tracking. See [docs/WORCLAUDE-INTEGRATION.md](docs/WORCLAUDE-INTEGRATION.md) for the integration guide and corrected consumption patterns.

## Run Locally

```bash
npm ci
npm start
```

For higher GitHub API rate limits:

```bash
GITHUB_TOKEN=ghp_... npm start
```

Outputs:

- `public/feeds/` — JSON, RSS, OPML, run report, run history
- `state/last-seen.json` — persisted known item IDs
- Console — timestamped per-source results

## Project Structure

```
anthropic-watch/
  .github/workflows/
    scrape.yml              # Daily cron + manual trigger → test, scrape, deploy
    test.yml                # Push/PR test runner
  public/
    index.html              # Self-contained dashboard
    feeds/                  # Generated feeds (JSON, RSS, OPML)
  src/
    index.js                # Pipeline orchestrator
    cli.js                  # CLI entry point
    sources.js              # 16 source definitions
    state.js                # State persistence + failure tracking
    fetch-with-retry.js     # Retry wrapper (2 retries, 15s timeout, 5xx only)
    fetch-source.js         # Fetch abstraction (supports fixture injection)
    parse-date.js           # Flexible date parser
    log.js                  # Timestamped structured logger
    summary.js              # GitHub Actions job summary
    feed/
      json.js               # JSON feed generator
      rss.js                # RSS 2.0 feed generator
      opml.js               # OPML 2.0 feed list
    scrapers/
      github-releases.js    # GitHub Releases API
      github-changelog.js   # GitHub CHANGELOG.md parser
      npm-registry.js       # npm registry API
      blog-page.js          # Multi-mode blog parser (nextjs-rsc, webflow, distill)
      docs-page.js          # Multi-mode docs parser (intercom-article, docs-hash)
      status-page.js        # Statuspage.io API
  state/
    last-seen.json          # Persisted known item IDs
  test/
    helpers/                # Test utilities
    fixtures/               # Captured response fixtures
    unit/                   # Unit tests
    scrapers/               # Scraper tests
    e2e/                    # End-to-end pipeline tests
```

## Documentation

- [FEED-SCHEMA.md](docs/FEED-SCHEMA.md) — Feed formats, item shape, schemas
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Pipeline design, concurrency, state, error handling
- [SOURCES.md](docs/SOURCES.md) — All 16 sources with detection methods and quirks
- [ADDING-SOURCES.md](docs/ADDING-SOURCES.md) — Step-by-step guide for new sources
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — Common issues and fixes
- [WORCLAUDE-INTEGRATION.md](docs/WORCLAUDE-INTEGRATION.md) — Downstream integration guide

## License

MIT
