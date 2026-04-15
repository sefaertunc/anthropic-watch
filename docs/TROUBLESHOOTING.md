# Troubleshooting

## Quick Diagnostics

1. **Dashboard:** Check the [live dashboard](https://sefaertunc.github.io/anthropic-watch/) for at-a-glance source status.
2. **Run report:** Fetch [`run-report.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-report.json) — check `summary.sourcesWithErrors` and individual source `status`/`error` fields.
3. **Run history:** Fetch [`run-history.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-history.json) — look for patterns in the `errors` array across recent runs.
4. **Actions logs:** Check the [GitHub Actions](../../actions) workflow runs for detailed scraper output.

---

## Common Issues

### Source returns 0 items

**Symptoms:** Source shows `status: "error"` with message `"returned 0 items (possible error)"`.

**Causes:**

- **parseMode mismatch:** The site's HTML structure changed and no longer matches the expected parse mode. Inspect the page, compare with the fixture, and update the parsing logic.
- **Site is temporarily down or rate-limited:** Check the source URL directly. The pipeline will self-heal on the next successful run.
- **New source on first run:** This is NOT an error on first run — the pipeline only flags 0 items when the source previously had known IDs in state.

**Fix:** Capture a fresh fixture (`node test/capture-fixtures.js <source-key>`), compare with the old one, and adjust the scraper if the HTML structure changed.

### Scraper times out

**Symptoms:** Error message mentions `AbortError` or `TimeoutError`.

**Context:** The default timeout is **15 seconds** per request, with up to **2 retries** (3 total attempts). Backoff is 1s then 2s.

**Causes:**

- Source server is slow or overloaded
- Network issues in the GitHub Actions runner

**Fix:** Usually self-resolves. If persistent, check whether the source URL is still valid. The retry logic handles transient failures automatically.

### GitHub API rate limit

**Symptoms:** Error message includes `HTTP 403` or `HTTP 429`. The log may also show `"GitHub API rate limit low: N remaining"`.

**Context:** Without a token, the GitHub API allows 60 requests/hour. With `GITHUB_TOKEN`, the limit is 5000/hour.

**Fix:**

- Ensure `GITHUB_TOKEN` is set as a secret in the repository settings
- Check Actions workflow — the `scrape` job passes `GITHUB_TOKEN` via env
- Locally: `GITHUB_TOKEN=ghp_... node src/cli.js`

### State file corruption

**Symptoms:** Pipeline crashes on startup with JSON parse error.

**Context:** `loadState()` throws on malformed JSON (but returns `{}` for missing files).

**Fix:**

1. Check `state/last-seen.json` for syntax errors
2. If unrecoverable, delete the file — the pipeline will treat all items as new on the next run and rebuild state from scratch
3. Commit and push the fix

### Feed duplicates

**Symptoms:** Same item appears multiple times in a feed.

**Context:** Deduplication key is `${id}|${source}`. An item is unique per-source.

**Causes:**

- A scraper generates different IDs for the same content across runs (e.g., the `docs-hash` scraper changes ID on every content edit)
- Two different sources track overlapping content with different keys

**Fix:** Check the scraper's ID generation logic. For hash-based scrapers, duplicates are expected behavior — old items are eventually pushed out by the feed limit.

### RSS validation errors

**Symptoms:** RSS readers reject or fail to parse `*.xml` feeds.

**Fix:**

1. Validate the feed with an online RSS validator
2. Check for entities in item content that aren't being escaped
3. The RSS generator uses `fast-xml-parser` with `processEntities: true` — most encoding is handled automatically

### Dashboard shows stale data

**Symptoms:** Dashboard shows old run data even though the pipeline has run recently.

**Causes:**

- GitHub Pages deployment hasn't propagated yet (can take a few minutes)
- The `scrape` job failed before reaching the deploy step
- Browser cache — try a hard refresh

**Fix:** Check the Actions log for the most recent `Scrape and Deploy` run. If the deploy step succeeded, wait a few minutes and hard refresh.

---

## Refreshing Fixtures

Test fixtures can become stale when source HTML/API responses change structure:

```bash
# Refresh all fixtures
node test/capture-fixtures.js

# Refresh one source
node test/capture-fixtures.js blog-engineering
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
```

For GitHub API sources, set the token to avoid rate limits:

```bash
GITHUB_TOKEN=ghp_... npm start
```

Output goes to:

- `public/feeds/` — all feed files
- `state/last-seen.json` — updated state
- Console — timestamped log with per-source results

---

## Nuclear Options

Use these only when other fixes fail.

### Reset state

Deleting `state/last-seen.json` causes the pipeline to treat all current items as new. This triggers a burst of "new" items in the feeds but is otherwise safe.

```bash
rm state/last-seen.json
node src/cli.js
```

### Force deploy

If feeds are stale but the pipeline is working, trigger a manual deploy:

1. Go to Actions → "Scrape and Deploy" → "Run workflow"
2. Or use the GitHub CLI: `gh workflow run scrape.yml`

This runs the full test + scrape + deploy pipeline on demand.
