# Adding Sources

Guide for adding a new source to anthropic-watch.

## 1. Determine Scraper Type

Pick the scraper that matches your source:

| Source type                       | Scraper type       | When to use                                                                                       |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| GitHub Releases page              | `github-releases`  | Repo publishes GitHub Releases                                                                    |
| Markdown changelog in a repo      | `github-changelog` | Repo has a `CHANGELOG.md` (or similar)                                                            |
| npm package                       | `npm-registry`     | Track latest version on npmjs.com                                                                 |
| Blog with server-rendered HTML    | `blog-page`        | Blog rendered as HTML (Next.js, Webflow, Distill)                                                 |
| Documentation page                | `docs-page`        | Docs page where you want to detect content changes                                                |
| Statuspage.io-powered status page | `status-page`      | Site uses Statuspage.io for incident tracking                                                     |
| GitHub commits (no releases)      | `github-commits`   | Repos that ship via direct commits rather than tagged releases (curated lists, skill directories) |
| Subreddit                         | `reddit-subreddit` | Public subreddit post feed. Requires OAuth2 credentials.                                          |
| Hacker News query                 | `hn-algolia`       | HN stories matching a search query. Public endpoint, no credentials.                              |
| Twitter / X account               | `twitter-account`  | Public Twitter timeline via twitterapi.io. Requires paid `TWITTERAPI_IO_KEY`.                     |

If none of these fit, you'll need to create a new scraper type (see step 7).

### Parse Mode Decision (for blog-page)

| HTML framework / pattern                      | Parse mode   |
| --------------------------------------------- | ------------ |
| Next.js with RSC payload (`self.__next_f`)    | `nextjs-rsc` |
| Webflow CMS (`.blog_cms_item`, `.w-dyn-item`) | `webflow`    |
| Distill.pub TOC (`.toc .date`, `.toc a.note`) | `distill`    |

### Parse Mode Decision (for docs-page)

| Content pattern                                          | Parse mode         |
| -------------------------------------------------------- | ------------------ |
| Intercom help center article                             | `intercom-article` |
| Any page where content-hash is enough                    | `docs-hash`        |
| Anthropic models reference page (stable per-model table) | `model-table`      |

> **Note on `model-table`:** this mode hard-codes selectors against the model comparison table on `docs.anthropic.com/en/docs/about-claude/models` (reading the header row for model display names and the "Claude API ID" row for stable ids). It is not reusable for arbitrary docs pages — use `docs-hash` for generic content-change detection or `intercom-article` for Intercom-hosted articles.

---

## 2. Add Source Config

Add an entry to the `sources` array in `src/sources.js`. Templates for each scraper type:

### github-releases

```js
{
  key: "my-source",
  name: "My Source Name",
  url: "https://github.com/org/repo/releases",
  category: "core",        // or "extended"
  scraperType: "github-releases",
  owner: "org",
  repo: "repo",
}
```

### github-changelog

```js
{
  key: "my-changelog",
  name: "My Changelog",
  url: "https://github.com/org/repo/blob/main/CHANGELOG.md",
  category: "core",
  scraperType: "github-changelog",
  owner: "org",
  repo: "repo",
  file: "CHANGELOG.md",     // path within the repo
}
```

### npm-registry

```js
{
  key: "my-npm-pkg",
  name: "My npm Package",
  url: "https://www.npmjs.com/package/@scope/name",
  category: "core",
  scraperType: "npm-registry",
  packageName: "@scope/name",
}
```

**Note:** The npm scraper makes two API calls — `/latest` and full doc. In tests, the full doc fixture path is set via `fixtureFileFull` on the source config (see `test/helpers/create-test-config.js`).

### blog-page

```js
{
  key: "my-blog",
  name: "My Blog",
  url: "https://example.com/blog",
  category: "extended",
  scraperType: "blog-page",
  parseMode: "nextjs-rsc",   // or "webflow" or "distill"
  basePath: "/blog",          // required for nextjs-rsc only
}
```

### docs-page

```js
{
  key: "my-docs",
  name: "My Docs Page",
  url: "https://docs.example.com/page",
  category: "extended",
  scraperType: "docs-page",
  parseMode: "docs-hash",     // "intercom-article" | "docs-hash" | "model-table"
}
```

### status-page

```js
{
  key: "my-status",
  name: "My Status Page",
  url: "https://status.example.com",
  category: "extended",
  scraperType: "status-page",
}
```

### github-commits

For repositories that ship via direct commits to a branch rather than tagged releases. Typically `category: "community"`.

```js
{
  key: "gh-commits-my-repo",
  name: "my-org/my-repo (main commits)",
  url: "https://github.com/my-org/my-repo",
  category: "community",
  scraperType: "github-commits",
  owner: "my-org",
  repo: "my-repo",
  branch: "main",        // optional, default "main"
  limit: 10,             // optional, default 10
  excludeBots: true,     // optional, default true — filters login/name matching /\[bot\]$/i
}
```

Notes: the bot filter catches GitHub App-style logins (`dependabot[bot]`, `renovate[bot]`). Classic-account bots without brackets (e.g. `renovate-bot`) will slip through — set `excludeBots: false` on noisy repos or accept the noise.

### reddit-subreddit

```js
{
  key: "reddit-mysub",
  name: "r/MySub (top/day)",
  url: "https://www.reddit.com/r/MySub/",
  category: "community",
  scraperType: "reddit-subreddit",
  subreddit: "MySub",          // required, no "r/" prefix
  mode: "top",                 // "top" | "new" | "hot"
  timeWindow: "day",           // only meaningful for mode:"top"; default "day"
  limit: 10,
}
```

Notes: the scraper fetches Reddit's public Atom RSS endpoint (`/r/<sub>/<mode>.rss`), which bypasses both the OAuth gate and Reddit's datacenter-IP block on `*.json`. The User-Agent is derived from root `package.json` version — you don't configure it. No credentials required. Per-post `score` and `stickied` are not exposed in the Atom response; rely on listing-level ranking (`mode: "top"`) for noise filtering.

### hn-algolia

```js
{
  key: "hn-my-filter",
  name: "Hacker News — my-filter",
  url: "https://hn.algolia.com/?q=my-query",
  category: "community",
  scraperType: "hn-algolia",
  query: "my-query OR another-query",   // Algolia query syntax
  tags: "story",                         // optional, default "story"
  limit: 20,
}
```

Notes: Algolia returns `hits:[]` for malformed queries without error. The scraper logs an info line on zero hits so a silently-broken query is visible in run output. Ask HN stories (no URL) fall back to the HN comment link.

### twitter-account

Requires the `TWITTERAPI_IO_KEY` GitHub Actions secret for production. Omitted locally without the key — the scraper returns `[]` gracefully.

```js
{
  key: "twitter-my-handle",
  name: "@my_handle (description)",
  url: "https://x.com/my_handle",
  category: "community",
  scraperType: "twitter-account",
  username: "my_handle",                 // no @ prefix
  limit: 10,
}
```

Notes:

- **Credential:** `TWITTERAPI_IO_KEY` env var is read in the scraper. Missing-or-empty key triggers the only Rule-4 carve-out in the scraper — return `[]` immediately without fetch, log info line, no `consecutiveFailures` tick.
- **All other failures throw.** 401 (bad key), 403, 429, 5xx, network errors — all surface as run-report errors. `fetchWithRetry` handles 429 with `Retry-After` automatically.
- **Field mapping:** tweet IDs are strings (Twitter snowflake IDs exceed `2^53`), `createdAt` arrives in Twitter legacy format (`"Wed Apr 22 17:36:07 +0000 2026"`) and is converted to ISO-8601 by the scraper. The API's `tweet.url` field is used directly (host is `x.com`, not `twitter.com`).
- **Pricing:** twitterapi.io pay-per-request — 8 accounts × 10 tweets × 30 days ≈ $0.36/month. Free tier is 1 req / 5 s; `fetchWithRetry` backs off on 429.
- **Retweets** pass through — titles starting with `RT @` are self-identifying. Replies are filtered at the API level via `includeReplies=false`.

---

## 3. Investigate the Source

Before writing code, inspect what the source returns:

```bash
# For HTML sources — look for post structure
curl -s "https://example.com/blog" | head -200

# For GitHub API — check release format
curl -s -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/org/repo/releases?per_page=3" | head -100

# For npm — check version and time fields
curl -s "https://registry.npmjs.org/@scope/name/latest" | head -50

# For status pages — check incidents endpoint
curl -s "https://status.example.com/api/v2/incidents.json" | head -100
```

Identify:

- Where post titles, dates, URLs, and descriptions live
- Which existing `parseMode` (if any) matches the HTML structure
- Whether you need a new parse mode or scraper type

---

## 4. Capture Fixture

```bash
node test/capture-fixtures.js my-source
```

This fetches live data and saves it to `test/fixtures/`. For HTML sources, the fixture is minimized (scripts/styles/SVGs removed). For JSON sources, the response is formatted. Verify the fixture looks correct before proceeding.

For GitHub API sources, set `GITHUB_TOKEN` to avoid rate limits:

```bash
GITHUB_TOKEN=ghp_... node test/capture-fixtures.js my-source
```

---

## 5. Add Tests

Create a test file in `test/scrapers/`. Import the specific scraper function and use `createSingleTestConfig`:

```js
import { describe, it, expect } from "vitest";
import { scrapeGithubReleases } from "../../src/scrapers/github-releases.js";
import { createSingleTestConfig } from "../helpers/create-test-config.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

describe("my-source", () => {
  it("extracts items from fixture", async () => {
    const config = createSingleTestConfig(
      "my-source",
      join(fixturesDir, "my-source.json"),
    );
    const items = await scrapeGithubReleases(config);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("url");
      expect(item).toHaveProperty("source", "my-source");
      expect(item).toHaveProperty("sourceCategory");
      expect(item).toHaveProperty("sourceName");
    }
  });
});
```

Run the tests:

```bash
npm test
```

---

## 6. Adding a New Parse Mode (for existing scrapers)

If the source uses an existing scraper type but needs different HTML parsing:

1. Add a new case to the `switch (source.parseMode)` block in the relevant scraper
2. Write the parsing function following the pattern of existing modes
3. Add a fixture and test for the new mode

---

## 7. Adding a New Scraper Type

If no existing scraper type fits:

1. Create `src/scrapers/my-scraper.js`:

```js
import { fetchSource } from "../fetch-source.js";

export async function scrapeMySource(source) {
  const res = await fetchSource(source.url, {}, source.fixtureFile);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`);

  // Parse response and return items. Let parse/network errors propagate —
  // the orchestrator captures rejected promises via Promise.allSettled and
  // records err.message in sourceResults[].error.
  return [
    {
      id: "unique-id",
      title: "Item title",
      date: new Date().toISOString(),
      url: source.url,
      snippet: "Description text",
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    },
  ];
}
```

2. Register in `scraperMap` in `src/index.js`:

```js
import { scrapeMySource } from "./scrapers/my-scraper.js";

const scraperMap = {
  // ... existing entries
  "my-scraper": scrapeMySource,
};
```

Key requirements:

- Accept a source config object, return `Array<Item>` on success. An empty array is a **legitimate** result (source has no items right now) — do not use it to hide errors.
- Throw on failure (HTTP 4xx/5xx, parse errors, missing expected fields). The orchestrator captures rejected promises via `Promise.allSettled` and writes `err.message` to `sourceResults[].error`.
- Use `fetchSource()` (not raw `fetch`) so fixture injection works in tests.
- Include all 8 item fields: `id`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`.

---

## 8. Update Documentation

- Add the source to `docs/SOURCES.md` in the appropriate tier section
- Update the source count in `README.md` if the total changed

---

## 9. Test End-to-End

```bash
# Run all tests
npm test

# Run the full pipeline locally
node src/cli.js
```

For GitHub sources, set `GITHUB_TOKEN` to avoid rate limits:

```bash
GITHUB_TOKEN=ghp_... node src/cli.js
```

---

## Checklist

- [ ] Source config added to `src/sources.js`
- [ ] Fixture captured with `node test/capture-fixtures.js my-source`
- [ ] Tests written and passing (`npm test`)
- [ ] If new scraper type: module created, registered in `scraperMap`
- [ ] If new parse mode: case added to switch block
- [ ] `docs/SOURCES.md` updated
- [ ] `README.md` source count updated (if changed)
- [ ] E2E verified with `node src/cli.js`
