# Architecture

## Overview

anthropic-watch is a Node.js pipeline that scrapes 16 Anthropic-related sources, detects new content, and publishes RSS/JSON feeds to GitHub Pages.

![Pipeline architecture](images/architecture.png)

All scraping uses `fetch` + `cheerio` for HTML parsing or direct JSON API calls. There is no browser automation (no Playwright, Puppeteer, or headless Chrome).

### Pipeline Flow

```
src/cli.js
  └─ runPipeline()                          [src/index.js]
       ├─ loadState()                       [src/state.js]
       ├─ Build scraper tasks (16 sources)  [src/sources.js]
       ├─ runWithConcurrency(tasks, 4)
       │    ├─ scraper(source)              [src/scrapers/*.js]
       │    │    └─ fetchSource(url)        [src/fetch-source.js]
       │    │         └─ fetchWithRetry()   [src/fetch-with-retry.js]
       │    └─ Promise.allSettled → results
       ├─ Process results
       │    ├─ isNew() / markSeen()         [src/state.js]
       │    ├─ recordSuccess/Failure()
       │    └─ Collect new items + errors
       ├─ Generate feeds
       │    ├─ all.json / all.xml           [src/feed/json.js, rss.js]
       │    ├─ {source}.json / {source}.xml
       │    ├─ sources.opml                 [src/feed/opml.js]
       │    ├─ run-report.json
       │    └─ run-history.json
       ├─ saveState()
       └─ Set GITHUB_OUTPUT (has_new_items)
```

---

## Scraper Contract

Every scraper function has the same signature:

- **Input:** a source config object from `sources.js`
- **Output:** `Array<Item>` on success, `[]` on error (errors caught internally)

There is no shared error class. Each scraper wraps its logic in try/catch and returns an empty array on failure. The orchestrator in `index.js` detects implicit failures (0 items when previously had items).

### Item Shape

Every item returned by a scraper must have these 8 fields:

```js
{
  id: "unique-id",           // string — format varies by scraper
  title: "Item title",       // string
  date: "2026-04-16T...",    // ISO 8601 string or null
  url: "https://...",        // string
  snippet: "Description",    // string, up to 300 chars, may be ""
  source: "source-key",      // string — from source.key
  sourceCategory: "core",    // string — from source.category
  sourceName: "Source Name",  // string — from source.name
}
```

---

## Scraper Types

| Type               | File                           | API/Method                                        | ID Strategy                                   | Date Strategy                 |
| ------------------ | ------------------------------ | ------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| `github-releases`  | `scrapers/github-releases.js`  | GitHub REST API (`/repos/:owner/:repo/releases`)  | `tag_name`                                    | `published_at`                |
| `github-changelog` | `scrapers/github-changelog.js` | GitHub Contents API (base64 decode)               | SHA-256 hash of file content (first 12 chars) | Current timestamp             |
| `npm-registry`     | `scrapers/npm-registry.js`     | npm registry API (`/latest` + full doc)           | Version string                                | `time[version]` from registry |
| `blog-page`        | `scrapers/blog-page.js`        | fetch HTML + cheerio, with `parseMode` switch     | Post URL                                      | Parsed from page content      |
| `docs-page`        | `scrapers/docs-page.js`        | fetch HTML + cheerio, with `parseMode` switch     | URL or SHA-256 hash                           | Parsed or current timestamp   |
| `status-page`      | `scrapers/status-page.js`      | Statuspage.io REST API (`/api/v2/incidents.json`) | Incident ID                                   | `created_at`                  |

### blog-page Parse Modes

- **`nextjs-rsc`** — Extracts post objects from Next.js RSC inline payload (`self.__next_f.push` chunks). Looks for objects with `slug`, `title`, and `publishedOn` fields. Falls back to HTML link parsing (`a[href^="basePath/"]`) if RSC extraction yields no results.
- **`webflow`** — Parses Webflow CMS items via `.blog_cms_item` and `.w-dyn-item` selectors. Extracts titles from `.card_blog_title` or heading elements.
- **`distill`** — Parses Distill.pub-style TOC layout. Reads `.toc .date` elements for date context, then `.toc a.note` elements for post titles and links.

### docs-page Parse Modes

- **`intercom-article`** — Targets Intercom help center articles. Finds container via `.article_body`, `.intercom-article-body`, or `<article>`. Parses `<h3>` elements as date headings with sibling `<p>` content.
- **`docs-hash`** — Strips nav/footer/script/style, hashes body text with SHA-256, and emits a single item. Any content change produces a new hash ID.

---

## fetchSource Abstraction

`src/fetch-source.js` provides the `fetchSource(url, options, fixtureFile)` function:

- **Production mode** (`fixtureFile` is null): delegates to `fetchWithRetry()` for real HTTP requests
- **Test mode** (`fixtureFile` is set): reads the fixture file from disk and returns a mock response object with `ok: true`, `text()`, and `json()` methods

This abstraction is what makes the test suite deterministic — scrapers call `fetchSource` instead of `fetch` directly, and tests pass fixture file paths via source config.

---

## Concurrency Model

`src/index.js` runs scrapers through `runWithConcurrency(tasks, limit)`:

- Default concurrency limit: **4** simultaneous scrapers
- Implementation: a `Set` of in-flight promises. When the set reaches the limit, `Promise.race(executing)` waits for any one to finish before launching the next task
- All results collected via `Promise.allSettled` — one scraper failure does not abort others
- Errors on Promise.race are caught with `.catch(() => {})` to prevent unhandled rejection (the real error is captured by allSettled)

---

## State Management

State is stored in `state/last-seen.json` and managed by `src/state.js`.

### State Shape (per source key)

```json
{
  "blog-engineering": {
    "knownIds": ["https://anthropic.com/engineering/post-1", "..."],
    "lastChecked": "2026-04-16T06:00:00.000Z",
    "consecutiveFailures": 0,
    "lastSuccess": "2026-04-16T06:00:00.000Z"
  }
}
```

### State Functions

| Function                      | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `loadState(path)`             | Read and parse JSON. Returns `{}` if file missing (ENOENT).       |
| `saveState(state, path)`      | Write JSON, creating parent directories if needed.                |
| `isNew(state, key, id)`       | `true` if `id` is not in `knownIds` (or source has no entry yet). |
| `markSeen(state, key, items)` | Add item IDs to `knownIds`, update `lastChecked`.                 |
| `recordSuccess(state, key)`   | Reset `consecutiveFailures` to 0, set `lastSuccess`.              |
| `recordFailure(state, key)`   | Increment `consecutiveFailures`.                                  |

### Failure Detection

The orchestrator detects implicit scraper failures: if a scraper returns 0 items but the source has existing `knownIds` in state, it is treated as an error. First-run sources with 0 items are not flagged. Sources with `consecutiveFailures >= 3` trigger a warning in logs.

### State Corruption Recovery

`loadState()` returns `{}` when the state file does not exist (ENOENT). This means deleting a corrupted state file is safe — the pipeline will treat all current items as new and rebuild state from scratch. Any other JSON parse error (malformed file) will throw and halt the pipeline.

---

## State Persistence

State is committed to `main` by the GitHub Actions workflow:

```yaml
git config user.name "anthropic-watch[bot]"
git config user.email "anthropic-watch[bot]@users.noreply.github.com"
git add state/last-seen.json
git diff --cached --quiet || git commit -m "chore: update last-seen state"
git push
```

The commit only happens if there are actual state changes (`git diff --cached --quiet` check). There is no `[skip ci]` tag on the commit message.

---

## Feed Generation

Feeds use an **accumulation model**: new items are merged with existing feed file contents.

1. Read existing `all.json` from disk → extract its `items` array
2. Merge new items in front of existing items
3. Deduplicate by `${id}|${source}`
4. Sort by `date` descending (nulls last)
5. Slice to limit (100 for all, 50 for per-source)
6. Write JSON and RSS files

The same merge/dedup/sort/slice logic runs for both JSON and RSS generation. Per-source feeds follow the same pattern but with items filtered to one source and a limit of 50.

### Output Files

| Output                         | Contains                                                  | Use case                          |
| ------------------------------ | --------------------------------------------------------- | --------------------------------- |
| Feed files (`*.json`, `*.xml`) | Items with full content                                   | RSS readers, downstream consumers |
| `run-report.json`              | Per-source status, timing, error messages, summary counts | Dashboard, monitoring             |
| `run-history.json`             | Array of past run summaries with error lists (max 30)     | Trend analysis, health tracking   |
| `sources.opml`                 | OPML 2.0 feed list grouped by Core/Extended               | Bulk RSS subscription             |

Items are **not** included in `run-report.json` — they are stripped via destructuring (`{ items, ...rest }`) at write time.

---

## Error Handling

There is no centralized error class (no `ScraperError` or `src/errors.js`). Error handling works at two levels:

1. **Scraper level:** Each scraper wraps its logic in try/catch and returns `[]` on failure.
2. **Orchestrator level:** `index.js` processes `Promise.allSettled` results. Rejected promises have the source and duration attached via `Object.assign(err, { _source, _durationMs })`. Zero-item results with existing state are also recorded as errors.

---

## Retry Logic

`src/fetch-with-retry.js` wraps the native `fetch`:

- **Max retries:** 2 (3 total attempts)
- **Backoff:** Linear — 1 second after first failure, 2 seconds after second (`1000 * (attempt + 1)`)
- **Timeout:** 15 seconds per request (via `AbortSignal.timeout`)
- **Retry condition:** 5xx responses and network errors. 4xx responses are **not** retried (returned immediately).
- **User-Agent:** `anthropic-watch/0.4`
- **Rate limit monitoring:** `logGitHubRateLimit(res)` warns when remaining GitHub API quota drops below 10.

---

## GitHub Actions

### `scrape.yml` — Scrape and Deploy

- **Triggers:** Daily cron (`0 6 * * *`) + manual `workflow_dispatch`
- **Permissions:** `contents: write`, `pages: write`
- **Jobs:**
  1. **`test`** — checkout, setup Node.js 20, `npm ci`, `npm test`
  2. **`scrape`** (needs `test`) — checkout, setup Node.js 20, `npm ci`, run `node src/cli.js` with `GITHUB_TOKEN`, write job summary via `node src/summary.js >> $GITHUB_STEP_SUMMARY`, commit state changes as `anthropic-watch[bot]`, deploy to GitHub Pages via `peaceiris/actions-gh-pages@v4` with `keep_files: true`

### `test.yml` — Test

- **Triggers:** Push to `main`, pull requests to `main`
- **Job:** checkout, setup Node.js 20, `npm ci`, `npm test`

### Job Summary

`src/summary.js` reads the run report and state, then outputs a markdown table with per-source status. Sources with 3+ consecutive failures generate `::warning` annotations visible in the Actions UI.

---

## Testing Architecture

Tests use **Vitest** and operate on fixture files rather than live network calls.

### Fixture Injection

Scrapers accept a `fixtureFile` path via `fetchSource()`. When set, `fetchSource` reads from disk instead of making HTTP requests. This is the core mechanism that makes tests deterministic.

### Test Helpers

- `createTestConfigs(fixturesDir)` — generates configs for all 16 sources pointing to fixture files in the given directory
- `createSingleTestConfig(key, path)` — generates a config for one source with a specific fixture file

### Fixture Capture

`node test/capture-fixtures.js [source-key]` fetches live data and saves fixtures to `test/fixtures/`. HTML fixtures are minimized (scripts/styles/SVGs removed, images stripped). JSON fixtures are formatted.

### Test Directories

- `test/unit/` — Unit tests for feeds, state, date parsing, retry logic, logging, workflow
- `test/scrapers/` — Per-scraper tests using captured fixtures
- `test/e2e/` — End-to-end pipeline tests (full pipeline, no-changes detection, error resilience, feed validation)
- `test/fixtures/` — Captured response data
- `test/fixtures/malformed/` — Intentionally broken fixtures for error resilience testing
- `test/fixtures/updated/` — Modified fixtures for new-item detection testing

---

## Dependencies

### Runtime

| Package           | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `cheerio`         | HTML parsing for blog-page and docs-page scrapers |
| `fast-xml-parser` | XML generation for RSS feeds and OPML             |

### Development

| Package  | Purpose                           |
| -------- | --------------------------------- |
| `vitest` | Test runner and assertion library |
| `yaml`   | YAML parsing used in test helpers |

Node.js built-ins used: `node:fs/promises`, `node:path`, `node:url`, `node:crypto` (SHA-256 hashing).
