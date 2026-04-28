# Architecture

## Overview

anthropic-watch is a Node.js pipeline that scrapes Anthropic-related sources, detects new content, and publishes RSS/JSON feeds to GitHub Pages. The current source count is enumerated in `src/sources.js`; consumers should derive it from `summary.sourcesChecked` in `run-report.json`.

![Pipeline architecture](images/architecture.png)

All scraping uses `fetch` + `cheerio` for HTML parsing or direct JSON API calls. There is no browser automation (no Playwright, Puppeteer, or headless Chrome).

### Pipeline Flow

```
src/cli.js
  └─ runPipeline()                          [src/index.js]
       ├─ loadState()                       [src/state.js]
       ├─ Build scraper tasks               [src/sources.js]
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
- **Output:** `Array<Item>` on success, throws on failure

There is no shared error class. Scrapers let fetch/parse errors propagate; the orchestrator in `index.js` captures rejected promises via `Promise.allSettled` and records `error` + increments `consecutiveFailures` in `run-report.sources[]`.

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

| Type               | File                           | API/Method                                                                                                                                                           | ID Strategy                                   | Date Strategy                 |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| `github-releases`  | `scrapers/github-releases.js`  | GitHub REST API (`/repos/:owner/:repo/releases`)                                                                                                                     | `tag_name`                                    | `published_at`                |
| `github-changelog` | `scrapers/github-changelog.js` | GitHub Contents API (base64 decode)                                                                                                                                  | SHA-256 hash of file content (first 12 chars) | Current timestamp             |
| `github-commits`   | `scrapers/github-commits.js`   | GitHub REST API (`/repos/:owner/:repo/commits`)                                                                                                                      | Short SHA (first 7 chars)                     | `commit.author.date`          |
| `npm-registry`     | `scrapers/npm-registry.js`     | npm registry API (`/latest` + full doc)                                                                                                                              | Version string                                | `time[version]` from registry |
| `blog-page`        | `scrapers/blog-page.js`        | fetch HTML + cheerio, with `parseMode` switch                                                                                                                        | Post URL                                      | Parsed from page content      |
| `docs-page`        | `scrapers/docs-page.js`        | fetch HTML + cheerio, with `parseMode` switch                                                                                                                        | URL or SHA-256 hash                           | Parsed or current timestamp   |
| `status-page`      | `scrapers/status-page.js`      | Statuspage.io REST API (`/api/v2/incidents.json`)                                                                                                                    | Incident ID                                   | `created_at`                  |
| `reddit-subreddit` | `scrapers/reddit-subreddit.js` | OAuth2 against `oauth.reddit.com/r/:sub/:mode.json` (v1.4.1+); graceful-skip to `[]` when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` unset                            | Reddit `t3_*` name                            | `created_utc` (ISO-converted) |
| `hn-algolia`       | `scrapers/hn-algolia.js`       | HN Algolia (`/api/v1/search_by_date`)                                                                                                                                | Algolia `objectID`                            | `created_at`                  |
| `twitter-account`  | `scrapers/twitter-account.js`  | twitterapi.io (`/twitter/user/last_tweets`); module-scope `waitForSlot()` paces calls to 1 req / 6 s (v1.4.1+); graceful-skip to `[]` when `TWITTERAPI_IO_KEY` unset | Tweet ID (string)                             | `createdAt` (ISO-converted)   |

### blog-page Parse Modes

- **`nextjs-rsc`** — Extracts post objects from Next.js RSC inline payload (`self.__next_f.push` chunks). Looks for objects with `slug`, `title`, and `publishedOn` fields. Falls back to HTML link parsing (`a[href^="basePath/"]`) if RSC extraction yields no results.
- **`webflow`** — Parses Webflow CMS items via `.blog_cms_item` and `.w-dyn-item` selectors. Extracts titles from `.card_blog_title` or heading elements.
- **`distill`** — Parses Distill.pub-style TOC layout. Reads `.toc .date` elements for date context, then `.toc a.note` elements for post titles and links.

#### `nextjs-rsc` Known Brittleness

The primary path depends on Next.js's internal `self.__next_f.push([1, "..."])` chunk serialization — an undocumented framework implementation detail, not a public API. If Anthropic upgrades Next.js to a major version that changes this format (or switches to a different flight-data shape), JSON extraction yields 0 chunks.

The HTML fallback path (`parseNextjsRscHtml` — anchor-href matching on `basePath/`, title from `h2, h3, h4` or `[class*='title']`) catches this case. It's less precise (smaller title set, no `publishedOn` date) but survives most redesigns.

Re-validate both paths whenever Anthropic ships a blog redesign or a visible Next.js upgrade. The quickest check: `node test/capture-fixtures.js blog-engineering` + rerun the blog-page scraper tests.

### docs-page Parse Modes

- **`intercom-article`** — Targets Intercom help center articles. Finds container via `.article_body`, `.intercom-article-body`, or `<article>`. Parses `<h3>` elements as date headings with sibling `<p>` content.
- **`docs-hash`** — Strips nav/footer/script/style, hashes body text with SHA-256, and emits a single item. Any content change produces a new hash ID.
- **`model-table`** — Parses the Claude models comparison table on the models reference page. Header row cells become model display names; the `"Claude API ID"` row supplies stable per-model ids (`claude-opus-4-6`, `claude-sonnet-4-6`, …); the `"Description"` row supplies the snippet. Emits one item per model column. Throws if the table or the `"Claude API ID"` row is missing.

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

A rejected scraper promise is caught by `Promise.allSettled` in the orchestrator. The rejected-promise path records the failure unconditionally — regardless of first-run state — by calling `recordFailure()`, storing the thrown `err.message` in `sourceResults[].error`, and setting `status: "error"`. Fulfilled scrapers (including ones that legitimately return `[]`) are treated as successful. Sources with `consecutiveFailures >= 3` trigger a warning in logs.

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
3. Deduplicate by `${id}|${source}` (first-seen wins — the freshly scraped copy overwrites the persisted one)
4. Sort by `date` descending (nulls last)
5. Slice to limit (100 for all, 50 for per-source)
6. Write JSON and RSS files

The same merge/dedup/sort/slice logic runs for both JSON and RSS generation. Per-source feeds follow the same pattern but with items filtered to one source and a limit of 50.

**Persistence boundary:** existing feed files live on the `gh-pages` branch, not `main`. The CI workflow (`scrape.yml`) hydrates `public/feeds/` from `gh-pages` via a second `actions/checkout@v4` step before the scraper runs, so step 1's "read existing `all.json` from disk" finds the prior run's content. Without this hydration the merge degenerates to "this run's items only" — the v1.4.2 fix establishes the precondition this section's logic depends on.

See [FEED-SCHEMA.md — Merge Semantics](FEED-SCHEMA.md#merge-semantics) for the full conflict-resolution rules (why new-wins matters for in-place edits like `[Unreleased]` changelog sections).

### Output Files

| Output                         | Contains                                                  | Use case                          |
| ------------------------------ | --------------------------------------------------------- | --------------------------------- |
| Feed files (`*.json`, `*.xml`) | Items with full content                                   | RSS readers, downstream consumers |
| `run-report.json`              | Per-source status, timing, error messages, summary counts | Dashboard, monitoring             |
| `run-history.json`             | Array of past run summaries with error lists (max 90)     | Trend analysis, health tracking   |
| `sources.opml`                 | OPML 2.0 feed list grouped by Core/Extended               | Bulk RSS subscription             |

Items are **not** included in `run-report.json` — they are stripped via destructuring (`{ items, ...rest }`) at write time.

---

## Error Handling

There is no centralized error class (no `ScraperError` or `src/errors.js`). Error handling works at two levels:

1. **Scraper level:** Scrapers let errors propagate (no outer try/catch). Empty array returns mean "source legitimately has no items right now."
2. **Orchestrator level:** `index.js` processes `Promise.allSettled` results. Rejected promises have the source and duration attached via `Object.assign(err, { _source, _durationMs })`; the rejected path writes `err.message` into `sourceResults[].error` and increments `consecutiveFailures`.

---

## Retry Logic

`src/fetch-with-retry.js` wraps the native `fetch`:

- **Max retries:** 2 (3 total attempts)
- **Backoff:** Linear — 1 second after first failure, 2 seconds after second (`1000 * (attempt + 1)`)
- **Timeout:** 15 seconds per request (via `AbortSignal.timeout`)
- **Retry condition:** 5xx responses, network errors, and HTTP 429. When a 429 response carries a `Retry-After: N` header (seconds), that value overrides the default linear backoff for that attempt. Other 4xx responses are **not** retried (returned immediately).
- **Redirect handling:** `redirect: "follow"` is set in the default options so redirects are followed transparently. Individual scrapers can override via `options.redirect`.
- **User-Agent:** `` `anthropic-watch/${pkg.version} (…)` `` — version read from `package.json` at module load via `readFileSync`. Derivation means point releases require no manual doc edits.
- **Rate limit monitoring:** `logGitHubRateLimit(res)` warns when remaining GitHub API quota drops below 10.

---

## GitHub Actions

### `scrape.yml` — Scrape and Deploy

- **Triggers:** Daily cron (`0 6 * * *`) + manual `workflow_dispatch`
- **Permissions:** `contents: write`, `pages: write`
- **Single job:** `scrape` — checkout (using `SCRAPER_PAT` so downstream workflows can see the commit), setup Node.js 20, `npm ci`, run `node src/cli.js` with `GITHUB_TOKEN` + optional `TWITTERAPI_IO_KEY` / `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`, write job summary via `node src/summary.js >> $GITHUB_STEP_SUMMARY`, commit state changes as `anthropic-watch[bot]` inside a stash-and-resync retry loop (3 attempts with 5/10/15s backoff), deploy to GitHub Pages via `peaceiris/actions-gh-pages@v4` with `github_token: SCRAPER_PAT` and `keep_files: true`. The commit + deploy steps are guarded by `if: github.ref == 'refs/heads/main'` so feature-branch `workflow_dispatch` runs are read-only preflight validation.
- **State-commit retry (v1.4.1+):** on push failure the job stashes the generated state file, aborts any in-flight rebase, resyncs hard to `origin/main`, re-applies the stashed content, and retries the push. This replaces the v1.4.0 `git pull --rebase origin main && git push` loop, which could leave broken merge state between iterations when the state-file diff conflicted with a concurrent commit on main. `.github/workflows/scrape.yml` is the canonical source.
- **`SCRAPER_PAT` rationale:** The default `GITHUB_TOKEN` is deliberately scoped so pushes made with it do **not** trigger other workflows. Using a PAT for both the initial checkout and the Pages deploy means pushes to `main` and `gh-pages` can fan out to downstream automation. Required scopes: `repo` + `workflow`.

Tests are not duplicated here — they run on push/PR in `test.yml`.

### `test.yml` — Test

- **Triggers:** Push to `main`, pull requests to `main`
- **Job:** checkout, setup Node.js 20, `npm ci`, `npm test`

### `branch-name-check.yml` — Branch naming gate

- **Triggers:** `pull_request` targeting `main` (`opened`, `reopened`, `synchronize`, `edited`)
- **Job:** Fails the PR unless the source branch is `develop` (release source) or matches `feat/*`. `dependabot/*` and `renovate/*` branches are allowlisted so automated dependency PRs bypass the check.

### `release.yml` — Tag and GitHub Release automation (v1.4.1+)

- **Triggers:** `pull_request: closed` on `main` with the `merged==true` guard — fires only when a PR is actually merged, not when one is closed without merging. The daily `scrape.yml` state-commit push never opens a PR, so it cannot false-fire this workflow.
- **Job:** reads `package.json` version, skips cleanly if the matching `vX.Y.Z` tag already exists, otherwise extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` via awk, creates an annotated tag on the merge commit (`github-actions[bot]` identity), pushes it, and publishes a GitHub Release via `gh release create --notes-file`. Idempotent: docs-only PRs merge as a no-op. `concurrency: release-main` with `cancel-in-progress: false` serializes near-simultaneous merges.
- **Permissions:** `contents: write` using the default `GITHUB_TOKEN` — no `SCRAPER_PAT`, no external secrets. Orthogonal to `scrape.yml` (does not run the scraper, does not touch gh-pages).

### Job Summary

`src/summary.js` reads the run report and state, then outputs a markdown table with per-source status. Sources with 3+ consecutive failures generate `::warning` annotations visible in the Actions UI.

---

## Testing Architecture

Tests use **Vitest** and operate on fixture files rather than live network calls.

### Fixture Injection

Scrapers accept a `fixtureFile` path via `fetchSource()`. When set, `fetchSource` reads from disk instead of making HTTP requests. This is the core mechanism that makes tests deterministic.

### Test Helpers

- `createTestConfigs(fixturesDir)` — generates configs for every source pointing to fixture files in the given directory
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
