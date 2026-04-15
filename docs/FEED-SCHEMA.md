# Feed Schema Reference

All feeds are published to GitHub Pages and update daily.

**Base URL:** `https://sefaertunc.github.io/anthropic-watch/feeds/`

## Available Feeds

| File                | Format   | Description                           |
| ------------------- | -------- | ------------------------------------- |
| `all.json`          | JSON     | All items from every source (max 100) |
| `all.xml`           | RSS 2.0  | All items from every source (max 100) |
| `{source-key}.json` | JSON     | Items from a single source (max 50)   |
| `{source-key}.xml`  | RSS 2.0  | Items from a single source (max 50)   |
| `run-report.json`   | JSON     | Latest scrape run status and summary  |
| `run-history.json`  | JSON     | Last 30 run summaries                 |
| `sources.opml`      | OPML 2.0 | Feed list importable by RSS readers   |

---

## JSON Feed (`all.json`, `{source-key}.json`)

### Envelope

```json
{
  "version": "1.0",
  "title": "anthropic-watch — all sources",
  "description": "Monitoring Anthropic sources for changes",
  "home_page_url": "https://sefaertunc.github.io/anthropic-watch/",
  "generator": "anthropic-watch",
  "ttl": 1440,
  "generated": "2025-01-15T06:00:00.000Z",
  "itemCount": 42,
  "items": [...]
}
```

Per-source feeds use the title format `"anthropic-watch — {source name}"` (e.g. `"anthropic-watch — Claude Code Releases"`).

### Item Shape

Every item has these fields:

| Field            | Type             | Guarantee                                                                                 |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `id`             | `string`         | Always present. Format varies by scraper (tag name, URL, SHA hash, version, incident ID). |
| `title`          | `string`         | Always present. Human-readable title.                                                     |
| `url`            | `string`         | Always present. Link to the original content.                                             |
| `date`           | `string \| null` | ISO 8601 timestamp or `null` when the source provides no date.                            |
| `source`         | `string`         | Always present. Source key (e.g. `"claude-code-releases"`).                               |
| `sourceCategory` | `string`         | Always `"core"` or `"extended"`.                                                          |
| `sourceName`     | `string`         | Human-readable source name.                                                               |
| `snippet`        | `string`         | Up to 300 characters of body text. May be empty string.                                   |

### Sorting and Limits

- Items are sorted by `date` descending.
- Items with `null` dates sort last.
- Deduplication key: `${id}|${source}` — an item is unique per source.
- `all.json` / `all.xml`: max **100** items.
- Per-source feeds: max **50** items.
- New items are merged with existing feed contents each run (accumulation model), so items persist across runs until pushed out by the limit.

---

## RSS Feed (`all.xml`, `{source-key}.xml`)

Standard RSS 2.0 with these mappings:

| RSS Element                        | Value                                                |
| ---------------------------------- | ---------------------------------------------------- |
| `<title>`                          | Same title as JSON feed                              |
| `<link>`                           | `https://sefaertunc.github.io/anthropic-watch/`      |
| `<generator>`                      | `anthropic-watch`                                    |
| `<ttl>`                            | `1440`                                               |
| `<lastBuildDate>`                  | UTC string of generation time                        |
| `<item><guid isPermaLink="false">` | `item.id` (just the ID, not prefixed)                |
| `<item><category>`                 | `item.source` (the source key, e.g. `"blog-news"`)   |
| `<item><pubDate>`                  | UTC string from `item.date`, or empty string if null |
| `<item><description>`              | `item.snippet` or empty string                       |

Same sorting, dedup, and limits as the JSON feed.

---

## Run Report (`run-report.json`)

Generated after each scrape run. Provides status for all sources.

```json
{
  "version": "1.0",
  "runId": "2025-01-15T06:00:00.000Z",
  "timestamp": "2025-01-15T06:00:00.000Z",
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
    }
  ]
}
```

**Important notes:**

- `summary.healthySources` = sources with `"ok"` status (not a "skipped" concept).
- Source entry `status` is only `"ok"` or `"error"` — no other values.
- Source entries do **not** contain an `items` array. Items are stripped before writing the report. To get items, fetch the feed files (`all.json` or `{source-key}.json`).

---

## Run History (`run-history.json`)

A **raw JSON array** (not a wrapper object). Most recent run first. Max 30 entries.

```json
[
  {
    "timestamp": "2025-01-15T06:00:00.000Z",
    "durationMs": 12345,
    "totalNewItems": 5,
    "sourcesChecked": 16,
    "sourcesWithErrors": 1,
    "errors": [{ "key": "status-page", "error": "HTTP 503 for https://..." }]
  }
]
```

- `errors` is an array of `{ key, error }` objects (not plain strings).
- Empty `errors` array means all sources succeeded.

---

## OPML (`sources.opml`)

OPML **2.0** file with two groups: **Core** and **Extended**.

Each outline entry has:

- `text` — source name
- `type` — `"rss"`
- `xmlUrl` — `https://sefaertunc.github.io/anthropic-watch/feeds/{source-key}.xml`
- `htmlUrl` — original source URL

Import this file into any RSS reader to subscribe to all feeds at once.

---

## Versioning

All feed files include `"version": "1.0"`. Schema changes that add new optional fields will not bump the version. Breaking changes (field removal, type changes) will increment the version number.

---

## Example: Consuming Feeds

```js
// Fetch the latest run status
const report = await fetch(
  "https://sefaertunc.github.io/anthropic-watch/feeds/run-report.json",
).then((r) => r.json());

console.log(
  `${report.summary.healthySources}/${report.summary.sourcesChecked} sources healthy`,
);

// Items are NOT in the report — fetch the feed separately
const feed = await fetch(
  "https://sefaertunc.github.io/anthropic-watch/feeds/all.json",
).then((r) => r.json());

for (const item of feed.items.slice(0, 5)) {
  console.log(`[${item.source}] ${item.title} — ${item.url}`);
}
```
