# Worclaude Integration

## Overview

**Worclaude** is a downstream consumer of anthropic-watch feeds. anthropic-watch provides the data layer — scraping Anthropic sources and publishing structured feeds — while Worclaude uses those feeds to power its own features (notifications, status checks, summaries).

## Architecture

```
┌──────────────────┐         ┌──────────────────┐
│  anthropic-watch │         │    Worclaude      │
│                  │         │                   │
│  scrape → feeds ─┼────────▶│  consume feeds    │
│                  │  HTTP   │  display/notify   │
│  GitHub Pages    │         │                   │
└──────────────────┘         └──────────────────┘
```

anthropic-watch publishes static JSON/RSS files to GitHub Pages. Worclaude fetches these files over HTTP. There is no API, webhook, or direct integration — the feed files are the interface.

## Feed Consumption

### What to fetch

| Data needed                           | Fetch from                            | NOT from              |
| ------------------------------------- | ------------------------------------- | --------------------- |
| Items (titles, URLs, dates, snippets) | `all.json` or `{source-key}.json`     | ~~`run-report.json`~~ |
| Source status (ok/error, timing)      | `run-report.json`                     |                       |
| Run history and trends                | `run-history.json`                    |                       |
| Per-source health                     | `run-report.json` → each source entry |                       |

**Important:** Items are **not** included in `run-report.json`. The report contains only status metadata. To get actual items, fetch the feed files.

### Corrected consumption pattern

```js
const BASE = "https://sefaertunc.github.io/anthropic-watch/feeds";

// 1. Get run status
const report = await fetch(`${BASE}/run-report.json`).then((r) => r.json());
const { totalNewItems, sourcesChecked, sourcesWithErrors, healthySources } =
  report.summary;

// 2. Get items from the feed (NOT from the report)
const feed = await fetch(`${BASE}/all.json`).then((r) => r.json());
const recentItems = feed.items.slice(0, 20);

// 3. Per-source status from the report
for (const src of report.sources) {
  if (src.status === "error") {
    console.log(`${src.key}: ERROR — ${src.error}`);
  }
}

// 4. Per-source items (if needed) — separate fetch
const claudeCodeItems = await fetch(`${BASE}/claude-code-releases.json`)
  .then((r) => r.json())
  .then((f) => f.items);
```

### Run report source entry shape

```json
{
  "key": "claude-code-releases",
  "name": "Claude Code Releases",
  "category": "core",
  "status": "ok",
  "newItemCount": 2,
  "durationMs": 1234,
  "error": null
}
```

Note: `status` is only `"ok"` or `"error"`. There is no `"skipped"` status.

## Impact Mapping

Which anthropic-watch sources are relevant to which Worclaude components:

| Worclaude component   | Relevant sources                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| Claude Code updates   | `claude-code-releases`, `claude-code-changelog`, `npm-claude-code`        |
| API/SDK changes       | `api-sdk-ts-releases`, `agent-sdk-ts-changelog`, `agent-sdk-py-changelog` |
| Product announcements | `blog-news`, `blog-engineering`, `blog-claude`                            |
| Incident awareness    | `status-page`                                                             |
| Research tracking     | `blog-research`, `blog-alignment`, `blog-red-team`                        |
| Release notes         | `docs-release-notes`, `support-release-notes`                             |
| CI/CD tooling         | `claude-code-action`                                                      |

## Planned Features

- **/upstream-check command:** A Worclaude command that fetches `run-report.json` and displays a formatted summary of source health and recent changes.
- **upstream-watcher agent:** A background agent that periodically checks feeds and alerts on new items matching configurable filters.

## Reliability Considerations

### Stale reports

Feeds update daily at ~06:00 UTC. If a Worclaude feature needs fresher data, it should display the `timestamp` from the report so users know when data was last refreshed.

### Error handling

Always handle fetch failures gracefully. GitHub Pages can have brief outages. Cache the last successful response and fall back to it.

### Stable URLs

All feed URLs are stable and follow the pattern:

- `https://sefaertunc.github.io/anthropic-watch/feeds/all.json`
- `https://sefaertunc.github.io/anthropic-watch/feeds/{source-key}.json`
- `https://sefaertunc.github.io/anthropic-watch/feeds/run-report.json`
- `https://sefaertunc.github.io/anthropic-watch/feeds/run-history.json`

Source keys are defined in `src/sources.js` and do not change once added.

### Schema versioning

Feed files include `"version": "1.0"`. Worclaude should check this field and handle unknown versions gracefully. See [FEED-SCHEMA.md](./FEED-SCHEMA.md) for the full schema specification.
