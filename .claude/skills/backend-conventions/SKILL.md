---
description: "Scraper contract, fetch/retry, state persistence, and feed generation conventions for anthropic-watch"
when_to_use: "When editing code under src/, adding or modifying scrapers, changing state or feed behavior, or debugging the pipeline"
version: "1.0.0"
paths:
  - "src/**"
  - "test/**"
---

# Backend Conventions — anthropic-watch

This project is a scraper pipeline, not a web service. There is no HTTP API, no database, no auth. Backend conventions here cover scrapers, fetching, state, and feed generation.

Authoritative deep-dive: `docs/ARCHITECTURE.md`. This document is the working-memory summary for agents.

## Scraper Contract

Every scraper is a function with a fixed signature:

- **Input:** source config object from `src/sources.js` (must include `key`, `category`, `name`, and type-specific fields)
- **Output:** `Array<Item>` on success; **throws** on failure
- **Item shape:** 8 fields — `id`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`

Rules:

1. **Never wrap scraper logic in `try/catch { return [] }`.** Let errors propagate. The orchestrator's `Promise.allSettled` captures them, records the real message, and increments `consecutiveFailures`. The v1.0.1 silent-failure bug was caused by scrapers catching their own errors.
2. **Empty array return means "no items right now"** — it is not a failure signal. Return `[]` when the source is live but has nothing new.
3. **IDs must be stable.** Don't use timestamps or random values. Use source-natural IDs: `tag_name`, post URL, version string, incident ID, heading text. Use SHA-256 hashes only as a fallback when no natural ID exists.
4. **`date` may be `null`** when the source legitimately has no per-item date (e.g. the models reference table). Never fake a date.
5. **`snippet` max 300 chars**, may be `""`. Plain text only — markdown or HTML in snippets breaks RSS consumers.

## Fetching

All HTTP goes through `src/fetch-with-retry.js`, accessed via `src/fetch-source.js` (which adds fixture injection for tests).

- **Max retries:** 2 (3 total attempts)
- **Backoff:** linear — 1s, 2s
- **Timeout:** 15s per request (`AbortSignal.timeout`)
- **Retries on:** 5xx, network errors, 429
  - On 429, `Retry-After` header (seconds) overrides linear backoff for that attempt
- **Does not retry:** other 4xx — returned immediately
- **Redirects:** `redirect: "follow"` by default; scrapers can override
- **User-Agent:** derived from `package.json` version at module load (`anthropic-watch/${version} (…)`)
- **GitHub rate limit:** `logGitHubRateLimit(res)` warns when remaining quota < 10

Never call `fetch` directly from a scraper — always route through `fetchSource(url, options, fixtureFile)` so test fixtures work.

## State

State lives in `state/last-seen.json` and is managed by `src/state.js`.

Per-source entry:

```json
{
  "knownIds": ["id-1", "id-2"],
  "lastChecked": "2026-04-16T06:00:00.000Z",
  "consecutiveFailures": 0,
  "lastSuccess": "2026-04-16T06:00:00.000Z"
}
```

Rules:

- **State is append-only.** Never delete keys. If a source is removed from `sources.js`, its state entry stays — the source may come back.
- **`loadState()` returns `{}` on ENOENT.** Missing file is safe; pipeline treats everything as new. Malformed JSON throws and halts the pipeline.
- **`recordFailure()` runs unconditionally** on rejected scraper promises, including first runs. There is no "first-run heuristic" — that was removed in v1.0.1.
- **Warning threshold:** `consecutiveFailures >= 3` triggers `::warning` annotations in the GitHub Actions job summary.

## Feed Generation (`src/feed/`)

Accumulation model, applied identically to JSON and RSS:

1. Read existing feed file → extract `items` array
2. Prepend new items: `[...newItems, ...existingItems]`
3. Dedup by `${id}|${source}` — **first-seen wins**, so the freshly scraped copy overwrites the persisted one
4. Sort by `date` descending (nulls last)
5. Slice: 100 for `all.*`, 50 for per-source

The new-wins semantics matter for in-place edits like `[Unreleased]` changelog sections — the latest snippet replaces the stale one.

## Error Handling Philosophy

- **No shared error class hierarchy.** Plain `Error` with descriptive messages. Don't introduce `ScraperError`, `FetchError`, etc.
- **Two levels:**
  1. **Scraper level:** let errors propagate — no outer `try/catch`.
  2. **Orchestrator level:** `src/index.js` processes `Promise.allSettled` results. Rejected promises have `_source` and `_durationMs` attached via `Object.assign(err, { … })`; `err.message` is written to `sourceResults[].error`.
- **Logging:** `src/log.js` provides `log.info` / `log.warn`. Don't use `console.*` directly in source code — tests capture log output.

## Concurrency

`runWithConcurrency(tasks, 4)` in `src/index.js`:

- 4 scrapers in flight at once
- `Set` of in-flight promises; `Promise.race` waits for one to finish before launching the next
- All results collected via `Promise.allSettled` — one failure never aborts the others
- `.catch(() => {})` on the race is intentional: it prevents unhandled rejection (the real error is captured by `allSettled`)

## Dependencies Policy

Runtime deps are `cheerio` + `fast-xml-parser` only. Dev deps are `vitest` + `yaml`. Adding a new dep requires:

1. A concrete use case existing tools can't cover
2. A CHANGELOG entry in the same PR explaining why
3. Preference for Node built-ins first (`node:crypto`, `node:fs/promises`, `node:path`, `node:url`)

## Naming

- **File names:** kebab-case (`fetch-with-retry.js`, `github-releases.js`)
- **Function names:** camelCase (`runPipeline`, `fetchSource`, `markSeen`)
- **Source keys:** kebab-case matching the feed filename (`blog-engineering`, `api-sdk-py-releases`)
- **Parse modes:** kebab-case string literals (`nextjs-rsc`, `intercom-article`, `model-table`)
- **Constants:** `UPPER_SNAKE_CASE` when module-level, otherwise named like the value
