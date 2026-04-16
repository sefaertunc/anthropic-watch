# Troubleshooting

## Quick Diagnostics

1. **Dashboard:** Check the [live dashboard](https://sefaertunc.github.io/anthropic-watch/) for at-a-glance source status (green/red/amber dots).
2. **Run report:** Fetch [`run-report.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-report.json) — check `summary.sourcesWithErrors` and individual source `status`/`error` fields.
3. **Run history:** Fetch [`run-history.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-history.json) — look for patterns in the `errors` array across recent runs (last 30 stored).
4. **Actions logs:** Check the [GitHub Actions](../../actions) workflow runs for detailed per-scraper output with timestamps.

### Source Health History

The `consecutiveFailures` counter in `state/last-seen.json` tracks how many times a source has failed in a row. At 3+ failures, the pipeline logs a warning and the GitHub Actions job summary shows a `::warning` annotation. The dashboard shows an amber dot for sources with warnings.

---

## Common Issues

### Source returns 0 items

**Symptoms:** Source shows `status: "error"` with message `"returned 0 items (possible error)"`.

**Cause:** The pipeline flags 0 items as an error only when the source previously had known IDs in state. This usually means:

- **CSS selectors changed:** The site's HTML structure was redesigned and no longer matches the expected parse mode selectors.
- **API response format changed:** For JSON API sources, the response shape may have changed.
- **Site is temporarily down or returning an error page.**

**Diagnosis:**

```bash
# Fetch the page and compare with the fixture
curl -s "https://www.anthropic.com/engineering" > /tmp/current.html
diff <(head -50 test/fixtures/blog-engineering.html) <(head -50 /tmp/current.html)
```

**Fix:** Capture a fresh fixture (`node test/capture-fixtures.js <source-key>`), compare with the old one, and update the scraper parsing logic if the structure changed.

### Scraper times out

**Symptoms:** Error message mentions `AbortError` or `TimeoutError`.

**Context:** The default timeout is **15 seconds** per request, with up to **2 retries** (3 total attempts). Linear backoff: 1s then 2s between retries.

**Cause:** Source server is slow, overloaded, or temporarily unreachable. Network issues in the GitHub Actions runner can also cause this.

**Fix:** Usually self-resolves on the next run. If persistent, check whether the source URL is still valid. The retry logic handles transient 5xx failures automatically. 4xx responses are not retried.

### GitHub API rate limit

**Symptoms:** Error message includes `HTTP 403` or `HTTP 429`. The log may show `"GitHub API rate limit low: N remaining"`.

**Context:** Without a token, the GitHub API allows 60 requests/hour. With `GITHUB_TOKEN`, the limit is 5000/hour. anthropic-watch makes one API call per GitHub source per run (6 sources use GitHub APIs).

**Fix:**

- Ensure `GITHUB_TOKEN` is set as a secret in the repository settings
- Check Actions workflow — the `scrape` job passes `GITHUB_TOKEN` via env
- Locally: `GITHUB_TOKEN=ghp_... node src/cli.js`

### State file corruption

**Symptoms:** Pipeline crashes on startup with JSON parse error.

**Context:** `loadState()` returns `{}` for missing files (ENOENT) but throws on malformed JSON.

**Diagnosis:** Check `state/last-seen.json` for syntax errors.

**Fix:**

1. Try to fix the JSON syntax manually
2. If unrecoverable, delete the file — the pipeline will treat all items as new on the next run and rebuild state from scratch
3. Commit and push the fix

### Feed duplicates

**Symptoms:** Same item appears multiple times in a feed.

**Context:** Deduplication key is `${id}|${source}`. An item is unique per-source by this key.

**Cause:**

- A scraper generates different IDs for the same content across runs. The `docs-hash` scraper changes ID on every content edit — this is by design.
- Two different sources track overlapping content with different keys.

**Fix:** Check the scraper's ID generation logic. For hash-based scrapers, duplicates are expected behavior — old items are eventually pushed out by the feed limit (100 for all, 50 per-source).

### RSS validation errors

**Symptoms:** RSS readers reject or fail to parse `*.xml` feeds.

**Fix:**

1. Validate the feed with an online RSS validator (e.g., W3C Feed Validation Service)
2. Check for entities in item content that aren't being escaped
3. The RSS generator uses `fast-xml-parser` with `processEntities: true` — most encoding is handled automatically

### Dashboard shows stale data

**Symptoms:** Dashboard shows old run data even though the pipeline has run recently.

**Cause:**

- GitHub Pages deployment hasn't propagated yet (can take a few minutes)
- The `scrape` job failed before reaching the deploy step
- Browser cache

**Fix:** Check the Actions log for the most recent `Scrape and Deploy` run. If the deploy step succeeded, wait a few minutes and hard refresh (`Ctrl+Shift+R`).

---

## Refreshing Fixtures

Test fixtures can become stale when source HTML/API responses change structure:

```bash
# Refresh all fixtures
node test/capture-fixtures.js

# Refresh one source
node test/capture-fixtures.js blog-engineering

# For GitHub sources, set token to avoid rate limits
GITHUB_TOKEN=ghp_... node test/capture-fixtures.js
```

After refreshing, run `npm test` to verify scrapers still extract items correctly. If tests fail, the source structure has changed and the scraper needs updating.

---

## Running Locally

```bash
# Install dependencies
npm ci

# Run the full pipeline
npm start
# or equivalently:
node src/cli.js

# With GitHub API auth for higher rate limits
GITHUB_TOKEN=ghp_... npm start
```

Output goes to:

- `public/feeds/` — all feed files (JSON, RSS, OPML, run-report, run-history)
- `state/last-seen.json` — updated state
- Console — timestamped log with per-source results

---

## Nuclear Options

Use these only when other fixes fail.

### Reset state

Deleting `state/last-seen.json` causes the pipeline to treat all current items as new. This triggers a burst of "new" items in the feeds but is otherwise safe — the pipeline will rebuild state from scratch.

```bash
rm state/last-seen.json
node src/cli.js
```

### Force deploy

If feeds are stale but the pipeline is working, trigger a manual deploy:

1. Go to Actions → "Scrape and Deploy" → "Run workflow"
2. Or use the GitHub CLI: `gh workflow run scrape.yml`

This runs the full test + scrape + deploy pipeline on demand.
