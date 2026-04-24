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
      "uniqueKey": "v1.0.30|claude-code-releases", // Composite dedup key: `${id}|${source}`
      "title": "Claude Code v1.0.30", // Human-readable title
      "date": "2026-04-15T18:30:00.000Z", // ISO 8601 or null
      "url": "https://github.com/anthropics/claude-code/releases/tag/v1.0.30",
      "snippet": "Bug fixes and performance improvements", // Up to 300 chars, may be ""
      "source": "claude-code-releases", // Source key
      "sourceCategory": "core", // "core" | "extended" | "community" (extensible)
      "sourceName": "Claude Code Releases", // Human-readable source name
    },
  ],
}
```

Per-source feeds use the title format `"anthropic-watch — {source name}"` and a max of 50 items.

### Field Guarantees

| Field            | Type             | Nullable | Max Length | Notes                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `string`         | No       | —          | Format varies: tag name, URL, SHA-256 hash prefix, version, UUID                                                                                                                                                                                                 |
| `uniqueKey`      | `string`         | Yes      | —          | Composite dedup key in the form `${id}\|${source}`. Use this directly to deduplicate across sources. **Present since v1.2.0** — absent in archived pre-v1.2.0 feeds; consumers should fall back to `` `${item.id}\|${item.source}` `` when the field is missing. |
| `title`          | `string`         | No       | —          | Human-readable title from the source                                                                                                                                                                                                                             |
| `date`           | `string \| null` | Yes      | —          | ISO 8601 timestamp. `null` when the source provides no date                                                                                                                                                                                                      |
| `url`            | `string`         | No       | —          | Link to the original content                                                                                                                                                                                                                                     |
| `snippet`        | `string`         | No       | 300 chars  | Body text excerpt. May be empty string `""`                                                                                                                                                                                                                      |
| `source`         | `string`         | No       | —          | Source key from `src/sources.js`                                                                                                                                                                                                                                 |
| `sourceCategory` | `string`         | No       | —          | One of `"core"`, `"extended"`, or `"community"`. **Open/extensible** — new values may be added in minor releases; consumers should not treat this as an exhaustive enumeration. See the Extensibility note below.                                                |
| `sourceName`     | `string`         | No       | —          | Human-readable source name                                                                                                                                                                                                                                       |

### Consumer Expectations

Fields fall into two categories based on whether consumers should drive logic off them:

**Primary fields** — load-bearing. Consumers are expected to read these. Contract changes to these fields will be reflected in a major version bump (`version: "2.0"`).

- Item-level: `id`, `uniqueKey`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`
- Envelope-level: `version`, `items`

**Informational / observability fields** — present for debugging, rendering, and dashboards. Consumers may read these but should not depend on their exact values or presence beyond the current version.

- Envelope-level: `title`, `description`, `home_page_url`, `generator`, `ttl`, `generated`, `itemCount`
- Run-report: `runId`, `duration_ms`, `summary.*`, `sources[].durationMs`
- Run-history file: entire file is observability

Observability fields may be added, renamed, or removed across any patch release without a major version bump. Primary fields will not change without a major version bump.

**Note on nullability:** the primary vs. observability classification describes how contract changes are communicated (a major version bump for primary fields, free-to-change for observability), not whether a field is always present. A primary field may be nullable in the Field Guarantees table and may be introduced in a minor version — `uniqueKey` is the canonical example: primary (load-bearing for dedup), but `Nullable=Yes` because archived pre-v1.2.0 feeds predate it. Consumers must handle primary-but-nullable fields via the fallback documented on the field's row.

### Source Categories (extensible)

`sourceCategory` on items and `sources[].category` on the run report share the same value space:

- **`core`** — Primary Anthropic signal: official blogs, docs, status, SDK releases. High-reliability; consumer logic can act on these autonomously (e.g. open an issue, create a branch).
- **`extended`** — Anthropic-owned secondary signal: GitHub repos, npm packages, secondary blogs. Lower frequency than core but same trust level.
- **`community`** — Third-party sources not owned or operated by Anthropic. Includes Reddit, Hacker News, GitHub commits on Anthropic-owned repos that ship via direct commits rather than tagged releases, and (planned) Twitter. Consumers should treat `community` as **informational signal only** — lower reliability, potential for duplication with other sources, subject to external API availability and community opinion mixing. Not suitable for autonomous-action triggers.

**Extensibility policy.** The set of category values is **open**. New values may be added in minor releases of anthropic-watch (e.g. `"partner"`, `"research"`). Consumers:

- MUST handle unknown category values gracefully — e.g. default to "informational" rendering, log and continue, or pass through without special-casing.
- MUST NOT write `switch` statements that exhaust the known values without a default clause.
- SHOULD widen TypeScript type unions when adopting a new producer version rather than hardcoding the historical two/three values.

The `@sefaertunc/anthropic-watch-client` library's TypeScript typedef for `sourceCategory` widens in lockstep with producer releases. See `packages/client/CHANGELOG.md` for the version history.

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

- **Dedup key:** `${id}|${source}` — two items with the same id and source are considered the same item. The `uniqueKey` field on each item (added in v1.2.0) contains this pre-composed value so consumers can dedupe directly without string concatenation.
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

> **Planned for v2.0:** The RSS `guid` element currently uses the bare item `id`, which can collide across sources. In v2.0 the `guid` will change to the composite `${id}|${source}` form (matching the JSON `uniqueKey` field added in v1.2.0). Because RSS readers dedupe on `guid`, this change will cause a one-time re-notification of every existing feed item across `all.xml` and each per-source feed, and will therefore be released alongside the envelope `version` bump from `"1.0"` to `"2.0"`. RSS consumers who need collision-free identifiers today should compute `${id}|${source}` from the parsed feed manually or switch to `all.json` and use the `uniqueKey` field.

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
    "sourcesChecked": 37,
    "sourcesWithErrors": 1,
    "healthySources": 36
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

| Field                       | Type             | Notes                                                                               |
| --------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `version`                   | `string`         | Always `"1.0"`                                                                      |
| `runId`                     | `string`         | ISO 8601 timestamp (same as `timestamp`)                                            |
| `timestamp`                 | `string`         | ISO 8601 timestamp of run start                                                     |
| `duration_ms`               | `number`         | Total pipeline duration in milliseconds                                             |
| `summary.totalNewItems`     | `number`         | Total new items detected across all sources                                         |
| `summary.sourcesChecked`    | `number`         | Number of sources scraped                                                           |
| `summary.sourcesWithErrors` | `number`         | Number of sources that errored                                                      |
| `summary.healthySources`    | `number`         | Sources with `"ok"` status                                                          |
| `sources[].key`             | `string`         | Source key                                                                          |
| `sources[].name`            | `string`         | Human-readable source name                                                          |
| `sources[].category`        | `string`         | `"core"`, `"extended"`, or `"community"` (extensible — see Source Categories below) |
| `sources[].status`          | `string`         | Only `"ok"` or `"error"`                                                            |
| `sources[].newItemCount`    | `number`         | Number of new items (0 on error)                                                    |
| `sources[].durationMs`      | `number`         | Scrape duration for this source in milliseconds                                     |
| `sources[].error`           | `string \| null` | Error message or `null` on success                                                  |

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
    "sourcesChecked": 37,
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

Import this file into any RSS reader to subscribe to every source at once. The exact number of sources is not stable — sources may be added or removed over time. Consumers must derive counts from `summary.sourcesChecked` or `sources.length` in `run-report.json`, never hardcode a number. The `sources.opml` file regenerates each run from `src/sources.js`, so the outline always matches the current source list.

---

## Programmatic Consumption

> **Recommended path:** the official `@sefaertunc/anthropic-watch-client` npm package implements this exact pattern with version gating, typed errors, and a proven `uniqueKey` fallback. Install it with `npm install @sefaertunc/anthropic-watch-client` and see [`packages/client/README.md`](../packages/client/README.md). The example below is the canonical reference for this contract and is provided for non-JS consumers, consumers without npm access, and anyone evaluating the library.

Consumers in any language can fetch and process the feeds directly. Here is a worked example in JavaScript that demonstrates **version gating**, **composite-key deduplication**, and **state persistence** — three patterns every consumer should implement. The per-run work lives in an exported `async function run(seenSet)` so drift-protection tests can drive it directly; the bottom of the file shows how a driver script wires it up to disk-backed state.

```js
import { readFile, writeFile } from "node:fs/promises";

const FEED_URL = "https://sefaertunc.github.io/anthropic-watch/feeds/all.json";
const STATE_PATH = "./state.json";

// Compute the composite key, falling back if the feed predates v1.2.0.
// Archived feeds from before 2026-04 won't have `uniqueKey` on items.
const keyOf = (item) => item.uniqueKey ?? `${item.id}|${item.source}`;

/**
 * Perform one consumption cycle. Fetch, version-gate, filter to new items,
 * mutate `seenSet` in place with each fresh item's uniqueKey, and return the
 * fresh items. The caller owns the seen-set and its persistence.
 */
export async function run(seenSet) {
  const res = await fetch(FEED_URL);
  const feed = await res.json();

  // Version gate — fail fast on schema mismatch
  if (feed.version !== "1.0") {
    throw new Error(
      `anthropic-watch feed version ${feed.version} is not supported by this consumer.`,
    );
  }

  // Filter to genuinely new items using the composite dedup key.
  // Two items with the same `id` but different `source` are distinct.
  const fresh = feed.items.filter((item) => !seenSet.has(keyOf(item)));

  // Mutate the seen-set with the newly-seen keys. The caller will persist.
  for (const item of fresh) seenSet.add(keyOf(item));

  return fresh;
}

// Driver: load state, call run, report, persist. Runs only when this file is
// invoked directly (not when the module is imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  const prev = JSON.parse(await readFile(STATE_PATH, "utf8").catch(() => "[]"));
  const seen = new Set(prev);

  const fresh = await run(seen);

  console.log(`Found ${fresh.length} new items since last run.`);
  for (const item of fresh) {
    console.log(`[${item.source}] ${item.title} → ${item.url}`);
  }

  // Persist keys for the next run. Note: we store the composite key, not id,
  // so the next run's dedup is also correct.
  await writeFile(STATE_PATH, JSON.stringify([...seen], null, 2));
}
```

**Common pitfalls to avoid:**

- Do **not** deduplicate on `id` alone. Different sources can emit items with the same `id` (e.g. `claude-code-changelog` and `npm-claude-code` both use version strings like `"2.1.114"`). Always use `uniqueKey` or compute `${id}|${source}` yourself.
- Do **not** skip the version check. Future breaking schema changes will bump `version` from `"1.0"` to `"2.0"`; silent consumption of a new shape will surface as `undefined` field errors rather than a readable mismatch.
- Do **not** persist `id` in your state file. Persist `uniqueKey` (or `{id, source}` pairs). State files keyed only on `id` will silently collide across sources.

---

## Reference Fixtures

Consumers can pin against reference fixtures shipped in this repo for contract testing:

- `docs/fixtures/all.sample.json` — sample `all.json` response conforming to this schema
- `docs/fixtures/run-report.sample.json` — sample `run-report.json` response

These fixtures are regenerated each release and reflect the current schema version. Fixtures update additively — fields may be added across releases. Contract tests should assert on fields they care about rather than on the full shape.

---

## Versioning Policy

All feed files include `"version": "1.0"`. Schema changes that add new optional fields will not bump the version. Breaking changes (field removal, type changes) will increment the version number. Consumers should check the version field and handle unknown versions gracefully.
