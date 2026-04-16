# Adding Sources

Guide for adding a new source to anthropic-watch.

## 1. Determine Scraper Type

Pick the scraper that matches your source:

| Source type                       | Scraper type       | When to use                                        |
| --------------------------------- | ------------------ | -------------------------------------------------- |
| GitHub Releases page              | `github-releases`  | Repo publishes GitHub Releases                     |
| Markdown changelog in a repo      | `github-changelog` | Repo has a `CHANGELOG.md` (or similar)             |
| npm package                       | `npm-registry`     | Track latest version on npmjs.com                  |
| Blog with server-rendered HTML    | `blog-page`        | Blog rendered as HTML (Next.js, Webflow, Distill)  |
| Documentation page                | `docs-page`        | Docs page where you want to detect content changes |
| Statuspage.io-powered status page | `status-page`      | Site uses Statuspage.io for incident tracking      |

If none of these fit, you'll need to create a new scraper type (see step 7).

### Parse Mode Decision (for blog-page)

| HTML framework / pattern                      | Parse mode   |
| --------------------------------------------- | ------------ |
| Next.js with RSC payload (`self.__next_f`)    | `nextjs-rsc` |
| Webflow CMS (`.blog_cms_item`, `.w-dyn-item`) | `webflow`    |
| Distill.pub TOC (`.toc .date`, `.toc a.note`) | `distill`    |

### Parse Mode Decision (for docs-page)

| Content pattern                       | Parse mode         |
| ------------------------------------- | ------------------ |
| Intercom help center article          | `intercom-article` |
| Any page where content-hash is enough | `docs-hash`        |

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
  parseMode: "docs-hash",     // or "intercom-article"
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
  try {
    const res = await fetchSource(source.url, {}, source.fixtureFile);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Parse response and return items
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
  } catch {
    return [];
  }
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

- Accept a source config object, return `Array<Item>`
- Catch all errors, return `[]` on failure
- Use `fetchSource()` (not raw `fetch`) so fixture injection works in tests
- Include all 8 item fields: `id`, `title`, `date`, `url`, `snippet`, `source`, `sourceCategory`, `sourceName`

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
