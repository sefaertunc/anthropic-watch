# Feed Schema Reference

All feeds are published to GitHub Pages and update daily at ~06:00 UTC.

**Base URL:** `https://sefaertunc.github.io/anthropic-watch/feeds/`

## Available Feeds

| File                | Format  | Description                           |
| ------------------- | ------- | ------------------------------------- |
| `all.json`          | JSON    | All items from every source (max 100) |
| `all.xml`           | RSS 2.0 | All items from every source (max 100) |
| `{source-key}.json` | JSON    | Items from a single source (max 50)   |
| `{source-key}.xml`  | RSS 2.0 | Items from a single source (max 50)   |
| `run-report.json`   | JSON    | Latest scrape run status and summary  |
| `run-history.json`  | JSON    | Last 90 run summaries                 |

| `sources.opml` | OPML 2.0 | Feed list importable by RSS readers |

---

## JSON Feed (`all.json`, `{source-key}.json`)

### Full Example

```jsonc
{
  "version": "1.0", // Schema version
  "title": "anthropic-watch — all sources", // Feed title
  "description": "Monitoring Anthropic sources for changes", // Static description
  "home_page_url": "https://sefaertunc.github.io/anthropic-watch/",
  "generator": "anthropic-watch",
  "ttl": 1440, // Minutes between updates
  "generated": "2026-04-16T06:00:00.000Z", // ISO 8601 generation time
  "itemCount": 42, // Number of items in this response
  "items": [
    {
      "id": "v1.0.30", // Unique ID (format varies by scraper)
      "title": "Claude Code v1.0.30", // Human-readable title
      "date": "2026-04-15T18:30:00.000Z", // ISO 8601 or null
      "url": "https://github.com/anthropics/claude-code/releases/tag/v1.0.30",
      "snippet": "Bug fixes and performance improvements", // Up to 300 chars, may be ""
      "source": "claude-code-releases", // Source key
      "sourceCategory": "core", // "core" or "extended"
      "sourceName": "Claude Code Releases", // Human-readable source name
    },
  ],
}
```

Per-source feeds use the title format `"anthropic-watch — {source name}"` and a max of 50 items.

### Field Guarantees

| Field            | Type             | Nullable | Max Length | Notes                                                            |
| ---------------- | ---------------- | -------- | ---------- | ---------------------------------------------------------------- |
| `id`             | `string`         | No       | —          | Format varies: tag name, URL, SHA-256 hash prefix, version, UUID |
| `title`          | `string`         | No       | —          | Human-readable title from the source                             |
| `date`           | `string \| null` | Yes      | —          | ISO 8601 timestamp. `null` when the source provides no date      |
| `url`            | `string`         | No       | —          | Link to the original content                                     |
| `snippet`        | `string`         | No       | 300 chars  | Body text excerpt. May be empty string `""`                      |
| `source`         | `string`         | No       | —          | Source key from `src/sources.js`                                 |
| `sourceCategory` | `string`         | No       | —          | Always `"core"` or `"extended"`                                  |
| `sourceName`     | `string`         | No       | —          | Human-readable source name                                       |

### Envelope Fields

| Field           | Type     | Notes                                   |
| --------------- | -------- | --------------------------------------- |
| `version`       | `string` | Always `"1.0"`                          |
| `title`         | `string` | Feed title                              |
| `description`   | `string` | Static description                      |
| `home_page_url` | `string` | Dashboard URL                           |
| `generator`     | `string` | Always `"anthropic-watch"`              |
| `ttl`           | `number` | Always `1440` (minutes between updates) |
| `generated`     | `string` | ISO 8601 timestamp of generation        |
| `itemCount`     | `number` | Number of items in the `items` array    |

### Sorting and Limits

- Items are sorted by `date` descending.
- Items with `null` dates sort last.
- Deduplication key: `${id}|${source}` — an item is unique per source.
- `all.json` / `all.xml`: max **100** items.
- Per-source feeds: max **50** items.
- New items are merged with existing feed file contents each run (accumulation model), so items persist across runs until pushed out by the limit.

### Merge Semantics

Each run reads the existing feed file, merges the current run's new items, deduplicates, sorts, and slices. Specifically:

- **Dedup key:** `${id}|${source}` — two items with the same id and source are considered the same item.
- **Ordering:** new items are prepended before existing items (`[...newItems, ...existingItems]`) before the dedup pass.
- **Winner on conflict:** first-seen wins the dedup pass. Because new items are prepended, this means **the newly scraped version wins** — its `title`, `snippet`, `date`, and `url` overwrite the persisted copy. Use this when a source edits an entry in place (e.g. `[Unreleased]` in a changelog): the latest snippet/title reaches the feed, not a stale cached one.
- Sorting (by `date` desc, nulls last) runs after dedup.
- The slice is applied last: 100 for `all.*`, 50 for per-source feeds.

---

## RSS Feed (`all.xml`, `{source-key}.xml`)

Standard RSS 2.0. Full example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>anthropic-watch — all sources</title>
    <link>https://sefaertunc.github.io/anthropic-watch/</link>
    <description>Monitoring Anthropic sources for changes</description>
    <generator>anthropic-watch</generator>
    <ttl>1440</ttl>
    <lastBuildDate>Wed, 16 Apr 2026 06:00:00 GMT</lastBuildDate>
    <item>
      <title>Claude Code v1.0.30</title>
      <link>https://github.com/anthropics/claude-code/releases/tag/v1.0.30</link>
      <guid isPermaLink="false">v1.0.30</guid>
      <pubDate>Tue, 15 Apr 2026 18:30:00 GMT</pubDate>
      <category>claude-code-releases</category>
      <description>Bug fixes and performance improvements</description>
    </item>
  </channel>
</rss>
```

### Field Mapping

| RSS Element                        | Source                                          |
| ---------------------------------- | ----------------------------------------------- |
| `<title>`                          | Same title as JSON feed                         |
| `<link>`                           | `https://sefaertunc.github.io/anthropic-watch/` |
| `<generator>`                      | `anthropic-watch`                               |
| `<ttl>`                            | `1440`                                          |
| `<lastBuildDate>`                  | UTC string of generation time                   |
| `<item><title>`                    | `item.title`                                    |
| `<item><link>`                     | `item.url`                                      |
| `<item><guid isPermaLink="false">` | `item.id`                                       |
| `<item><pubDate>`                  | UTC string from `item.date`, or empty if null   |
| `<item><category>`                 | `item.source` (the source key)                  |
| `<item><description>`              | `item.snippet` or empty string                  |

Same sorting, dedup, and limits as the JSON feed.

---

## Run Report (`run-report.json`)

Generated after each scrape run. Provides status for all sources.

### Full Example

```json
{
  "version": "1.0",
  "runId": "2026-04-16T06:00:00.000Z",
  "timestamp": "2026-04-16T06:00:00.000Z",
  "duration_ms": 12345,
  "summary": {
    "totalNewItems": 5,
    "sourcesChecked": 16,
    "sourcesWithErrors": 1,
    "healthySources": 15
  },
  "sources": [
    {
      "key": "blog-engineering",
      "name": "Anthropic Engineering Blog",
      "category": "core",
      "status": "ok",
      "newItemCount": 2,
      "durationMs": 1234,
      "error": null
    },
    {
      "key": "status-page",
      "name": "Anthropic Status Page",
      "category": "extended",
      "status": "error",
      "newItemCount": 0,
      "durationMs": 15023,
      "error": "HTTP 503 for https://status.anthropic.com/api/v2/incidents.json"
    }
  ]
}
```

### Schema

| Field                       | Type             | Notes                                           |
| --------------------------- | ---------------- | ----------------------------------------------- |
| `version`                   | `string`         | Always `"1.0"`                                  |
| `runId`                     | `string`         | ISO 8601 timestamp (same as `timestamp`)        |
| `timestamp`                 | `string`         | ISO 8601 timestamp of run start                 |
| `duration_ms`               | `number`         | Total pipeline duration in milliseconds         |
| `summary.totalNewItems`     | `number`         | Total new items detected across all sources     |
| `summary.sourcesChecked`    | `number`         | Number of sources scraped                       |
| `summary.sourcesWithErrors` | `number`         | Number of sources that errored                  |
| `summary.healthySources`    | `number`         | Sources with `"ok"` status                      |
| `sources[].key`             | `string`         | Source key                                      |
| `sources[].name`            | `string`         | Human-readable source name                      |
| `sources[].category`        | `string`         | `"core"` or `"extended"`                        |
| `sources[].status`          | `string`         | Only `"ok"` or `"error"`                        |
| `sources[].newItemCount`    | `number`         | Number of new items (0 on error)                |
| `sources[].durationMs`      | `number`         | Scrape duration for this source in milliseconds |
| `sources[].error`           | `string \| null` | Error message or `null` on success              |

**Important:** Source entries do **not** contain an `items` array. Items are stripped before writing the report. To get items, fetch the feed files.

---

## Run History (`run-history.json`)

A **raw JSON array** (not a wrapper object). Most recent run first. Max 90 entries.

### Example

```json
[
  {
    "version": "1.0",
    "timestamp": "2026-04-16T06:00:00.000Z",
    "durationMs": 12345,
    "totalNewItems": 5,
    "sourcesChecked": 16,
    "sourcesWithErrors": 1,
    "errors": [
      {
        "key": "status-page",
        "error": "HTTP 503 for https://status.anthropic.com/api/v2/incidents.json"
      }
    ]
  }
]
```

### Schema

| Field               | Type     | Notes                                             |
| ------------------- | -------- | ------------------------------------------------- |
| `version`           | `string` | Entry schema version. Currently `"1.0"`.          |
| `timestamp`         | `string` | ISO 8601 timestamp of run                         |
| `durationMs`        | `number` | Total pipeline duration in milliseconds           |
| `totalNewItems`     | `number` | New items detected                                |
| `sourcesChecked`    | `number` | Sources scraped                                   |
| `sourcesWithErrors` | `number` | Sources that errored                              |
| `errors`            | `array`  | Array of `{ key: string, error: string }` objects |

Older entries written before v1.0.2 lack the `version` field — consumers should treat a missing `version` as `"1.0"` for backward compatibility.

- Empty `errors` array means all sources succeeded.

---

## OPML (`sources.opml`)

OPML **2.0** file with two groups: **Core** and **Extended**.

Each outline entry has:

- `text` — source name
- `type` — `"rss"`
- `xmlUrl` — `https://sefaertunc.github.io/anthropic-watch/feeds/{source-key}.xml`
- `htmlUrl` — original source URL

Import this file into any RSS reader to subscribe to all 16 feeds at once.

---

## Programmatic Consumption

```js
const BASE = "https://sefaertunc.github.io/anthropic-watch/feeds";

// Fetch the latest run status
const report = await fetch(`${BASE}/run-report.json`).then((r) => r.json());
console.log(
  `${report.summary.healthySources}/${report.summary.sourcesChecked} sources healthy`,
);

// Check for errors
for (const src of report.sources) {
  if (src.status === "error") {
    console.log(`${src.key}: ${src.error}`);
  }
}

// Items are NOT in the report — fetch the feed separately
const feed = await fetch(`${BASE}/all.json`).then((r) => r.json());
for (const item of feed.items.slice(0, 5)) {
  console.log(`[${item.source}] ${item.title} — ${item.url}`);
}
```

---

## Versioning Policy

All feed files include `"version": "1.0"`. Schema changes that add new optional fields will not bump the version. Breaking changes (field removal, type changes) will increment the version number. Consumers should check the version field and handle unknown versions gracefully.
