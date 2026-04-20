---
description: "Pipeline architecture, directory layout, naming, error philosophy, and the end-to-end pattern for adding a source"
when_to_use: "When writing new code that should follow established patterns, when reviewing code for consistency, or when orienting to the repo structure"
version: "1.0.0"
paths:
  - "src/**"
  - "test/**"
  - "public/**"
---

# Project Patterns — anthropic-watch

## Architecture Overview

Single-process Node.js pipeline invoked by a GitHub Actions cron. No services, no orchestration, no database. See `docs/ARCHITECTURE.md` for the definitive description; this is the working summary.

```
GitHub Actions cron (06:00 UTC)
  → node src/cli.js
    → runPipeline()                            src/index.js
        → loadState()                          state/last-seen.json
        → build scraper tasks                  src/sources.js
        → runWithConcurrency(tasks, 4)         Promise.allSettled
        → per-scraper:
            scraper(source)                    src/scrapers/{type}.js
              → fetchSource(url, opts, fx)     src/fetch-source.js
                → fetchWithRetry()             src/fetch-with-retry.js
        → diff vs. knownIds                    isNew / markSeen
        → accumulate + dedup + sort + slice    src/feed/{json,rss,opml}.js
        → write public/feeds/*                 100 all-items, 50 per source
        → write run-report.json + history
        → saveState()
  → git commit state + deploy public/ to gh-pages
```

## Directory Layout

```
src/
  cli.js                  Entry point — calls runPipeline()
  index.js                Orchestrator — concurrency, aggregation, feed writes
  sources.js              All source configs — add entries here to monitor new things
  state.js                State I/O + per-source success/failure tracking
  fetch-source.js         fetch abstraction with fixture injection for tests
  fetch-with-retry.js     fetch wrapper with timeout, retry, 429 handling, UA
  parse-date.js           Shared date parsing helpers
  log.js                  log.info / log.warn — never console.* in src/
  summary.js              Renders run-report.json as markdown for job summary
  feed/
    json.js               JSON feed writer (all + per-source)
    rss.js                RSS 2.0 writer
    opml.js               OPML 2.0 writer
  scrapers/
    github-releases.js    GitHub REST API
    github-changelog.js   GitHub Contents API + base64 decode
    npm-registry.js       npm registry API
    blog-page.js          fetch + cheerio (nextjs-rsc, webflow, distill)
    docs-page.js          fetch + cheerio (intercom-article, docs-hash, model-table)
    status-page.js        Statuspage.io REST API

test/
  unit/                   Feed, state, date, retry, logging, workflow
  scrapers/               Per-scraper tests using captured fixtures
  e2e/                    Full-pipeline tests with fixture configs
  fixtures/               Captured response data (HTML/JSON)
  fixtures/malformed/     Intentionally broken fixtures for error-resilience tests
  fixtures/updated/       Modified fixtures for new-item detection
  capture-fixtures.js     Refresh fixtures from live sources

public/
  index.html              Static dashboard (vanilla DOM, inline styles)
  feeds/                  Generated feed files (committed only on gh-pages)
  .nojekyll               Opt out of Jekyll on GitHub Pages

state/
  last-seen.json          Persisted state — committed to main by the cron

docs/
  ARCHITECTURE.md         Pipeline design (authoritative)
  SOURCES.md              Every source documented
  FEED-SCHEMA.md          Consumer-facing schemas (1.0)
  WORCLAUDE-INTEGRATION.md  Canonical consumer integration
  ADDING-SOURCES.md       Step-by-step to add a new source
  TROUBLESHOOTING.md      Operational runbook
  spec/
    SPEC.md               Product spec (references ARCHITECTURE)
    PROGRESS.md           Current phase and completed work

.github/workflows/
  scrape.yml              Daily cron + manual dispatch
  test.yml                npm test on push/PR
  branch-name-check.yml   Enforces develop or feat/* on PRs to main
```

## Naming

- **Files:** kebab-case (`fetch-with-retry.js`, `github-releases.js`). Exceptions: `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `SPEC.md`, `PROGRESS.md`.
- **Functions:** camelCase (`runPipeline`, `fetchSource`, `markSeen`).
- **Source keys:** kebab-case, match feed filename (`blog-engineering` → `blog-engineering.json`).
- **Parse modes:** kebab-case string literals (`nextjs-rsc`, `intercom-article`, `model-table`).
- **Exports:** named exports only, never default. (Matches global convention.)

## The Pattern for Adding a Source

End-to-end, in dependency order:

1. **Decide scraper type.** If one of the 6 existing types fits (`github-releases`, `github-changelog`, `npm-registry`, `blog-page`, `docs-page`, `status-page`), reuse it — zero new scraper code. Only add a new type or parse mode when a source's shape genuinely doesn't fit.
2. **Add the config to `src/sources.js`.** Required fields: `key`, `name`, `url`, `category` (`"core"` or `"extended"`), `type`, plus type-specific fields (owner/repo, packageName, basePath, parseMode, …).
3. **Capture a fixture:** `node test/capture-fixtures.js <new-key>` fetches live data into `test/fixtures/<key>.{html,json}`.
4. **Add a scraper test** in `test/scrapers/` that loads the fixture via `createSingleTestConfig(key, fixturePath)` and asserts on the item shape.
5. **Update docs in the same PR:**
   - `README.md` — badges, source count, per-source feed table, Monitored Sources table
   - `docs/SOURCES.md` — full entry under Core or Extended, plus Scraper Type Reference table
   - `docs/ARCHITECTURE.md` — only if a new scraper type or parse mode was introduced
   - `CHANGELOG.md` — a new `### Added` entry under the next version
6. **Bump `package.json` version** on the release commit (not the PR commit).
7. **Verify locally:** `npm test`, then `GITHUB_TOKEN=… node src/cli.js`, then inspect `public/feeds/<key>.json`.
8. **Post-merge:** the first scheduled run emits a backfill burst (30 items for `github-releases`, 1 for changelog, whatever's listed for blogs) and populates `state/last-seen.json`. Watch the next run-report for `consecutiveFailures > 0`.

See `docs/ADDING-SOURCES.md` for the step-by-step reference.

## Error Handling Philosophy

**Let it throw.** The whole pipeline is built around `Promise.allSettled` aggregating failures — scrapers throw, the orchestrator records, the dashboard shows. Any `try/catch` inside a scraper that swallows the error (returning `[]` on failure) breaks this contract and was the root cause of v1.0.1's silent-failure bug.

- No shared error class hierarchy. Plain `Error` with descriptive messages.
- No retry inside scrapers — `fetchWithRetry` handles HTTP retries centrally.
- Transient failures (5xx, 429, network) are retried automatically up to 2 times. Persistent failures (4xx except 429, parse errors, missing selectors) propagate immediately.
- A source with `consecutiveFailures >= 3` is surfaced as a warning in the GitHub Actions job summary and as amber/red on the dashboard. That's the alerting mechanism — there is no pager.

## Testing Pattern

Fixtures are the core of this test suite. Live network is out of scope for `npm test`; it's reserved for `npm run test:live` (fixture refresh only).

- **Unit tests** cover feed generation, state functions, date parsing, retry logic, and workflow helpers.
- **Scraper tests** use `createSingleTestConfig(key, fixturePath)` or `createTestConfigs(fixturesDir)` to point scrapers at captured fixtures via the `fetchSource` abstraction.
- **E2E tests** run the full pipeline against a fixtures directory, asserting on generated feed files and state transitions.
- **Error resilience tests** use `test/fixtures/malformed/` to confirm the pipeline survives broken inputs.
- **New-item detection tests** use `test/fixtures/updated/` to confirm state-based diffing works.

When adding new behavior, the working pattern is: fixture → scraper test → e2e test. Don't add tests that hit live endpoints.

## Versioning Pattern

- `package.json.version` is the source of truth.
- The User-Agent header reads it at module load — don't hardcode versions anywhere else.
- Feed schema version is separate (`"1.0"` in every output). It bumps only on breaking schema changes.
- Tagged GitHub Releases ship the project. No npm publish.
- Version bumps happen on the release commit, not per PR. See `docs/git-conventions/SKILL.md`.
