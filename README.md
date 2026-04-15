# anthropic-watch

Monitor Anthropic sources for changes and publish RSS/JSON feeds. Runs daily via GitHub Actions and deploys a self-contained dashboard to GitHub Pages.

## Sources

| Name                              | Key                      | Category | Type             |
| --------------------------------- | ------------------------ | -------- | ---------------- |
| Anthropic Engineering Blog        | `blog-engineering`       | Core     | blog-page        |
| Anthropic News Blog               | `blog-news`              | Core     | blog-page        |
| Anthropic Docs Release Notes      | `docs-release-notes`     | Core     | docs-page        |
| Claude Code Changelog             | `claude-code-changelog`  | Core     | github-changelog |
| Anthropic Support Release Notes   | `support-release-notes`  | Core     | docs-page        |
| Claude Code Releases              | `claude-code-releases`   | Core     | github-releases  |
| Claude Code npm Package           | `npm-claude-code`        | Core     | npm-registry     |
| Agent SDK TypeScript Changelog    | `agent-sdk-ts-changelog` | Core     | github-changelog |
| Agent SDK Python Changelog        | `agent-sdk-py-changelog` | Core     | github-changelog |
| Anthropic SDK TypeScript Releases | `api-sdk-ts-releases`    | Core     | github-releases  |
| Claude Code Action Releases       | `claude-code-action`     | Extended | github-releases  |
| Anthropic Alignment Blog          | `blog-alignment`         | Extended | blog-page        |
| Anthropic Red Team Blog           | `blog-red-team`          | Extended | blog-page        |
| Anthropic Research Blog           | `blog-research`          | Extended | blog-page        |
| Anthropic Claude Blog             | `blog-claude`            | Extended | blog-page        |
| Anthropic Status Page             | `status-page`            | Extended | status-page      |

## How It Works

1. GitHub Actions runs `node src/index.js` daily at 06:00 UTC
2. Each source is scraped with concurrency limit (4 at a time) and retry logic
3. New items are detected by comparing against persisted state (`state/last-seen.json`)
4. RSS, JSON, and OPML feeds are generated with accumulation (items preserved across runs)
5. A run report and history are written for the dashboard
6. Results are committed and deployed to GitHub Pages

## Feeds

- **All sources**: `feeds/all.json` / `feeds/all.xml`
- **Per-source**: `feeds/{source-key}.json` / `feeds/{source-key}.xml`
- **OPML**: `feeds/sources.opml`
- **Dashboard**: [sefaertunc.github.io/anthropic-watch](https://sefaertunc.github.io/anthropic-watch/)

## Subscribe

Import `feeds/sources.opml` into your RSS reader to subscribe to all feeds at once, or add individual feed URLs.

## Local Development

```bash
npm ci
node src/index.js
```

Optionally set `GITHUB_TOKEN` for higher GitHub API rate limits:

```bash
GITHUB_TOKEN=ghp_... node src/index.js
```

## Architecture

```
anthropic-watch/
  .github/workflows/scrape.yml   # Daily cron + manual trigger
  public/
    index.html                    # Self-contained dashboard
    feeds/                        # Generated JSON/RSS/OPML feeds
  src/
    index.js                      # Main orchestrator
    sources.js                    # 16 source definitions
    state.js                      # State persistence + failure tracking
    log.js                        # Structured timestamped logger
    errors.js                     # ScraperError class
    fetch-with-retry.js           # Retry wrapper with backoff
    summary.js                    # GitHub Actions job summary
    feed/
      json.js                     # JSON feed generator
      rss.js                      # RSS 2.0 feed generator
      opml.js                     # OPML 2.0 feed list
    scrapers/
      github-releases.js          # GitHub Releases API
      github-changelog.js         # GitHub raw CHANGELOG parser
      npm-registry.js             # npm registry API
      blog-page.js                # Multi-mode blog HTML parser
      docs-page.js                # Multi-mode docs HTML parser
      status-page.js              # Status page API
  state/
    last-seen.json                # Persisted known item IDs
```

## License

MIT
