# Troubleshooting

## Quick Diagnostics

1. **Dashboard:** Check the [live dashboard](https://sefaertunc.github.io/anthropic-watch/) for at-a-glance source status (green/red/amber dots).
2. **Run report:** Fetch [`run-report.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-report.json) — check `summary.sourcesWithErrors` and individual source `status`/`error` fields.
3. **Run history:** Fetch [`run-history.json`](https://sefaertunc.github.io/anthropic-watch/feeds/run-history.json) — look for patterns in the `errors` array across recent runs (last 90 stored).
4. **Actions logs:** Check the [GitHub Actions](../../actions) workflow runs for detailed per-scraper output with timestamps.

### Source Health History

The `consecutiveFailures` counter in `state/last-seen.json` tracks how many times a source has failed in a row. At 3+ failures, the pipeline logs a warning and the GitHub Actions job summary shows a `::warning` annotation. The dashboard shows an amber dot for sources with warnings.

---

## Common Issues

### Source shows as errored

**Symptoms:** Source shows `status: "error"` in `run-report.json` with an `error` field containing the thrown exception message (e.g., `"HTTP 503 for https://..."`, `"fetch failed"`, `SyntaxError: Unexpected token ...`).

**Cause:** Scrapers throw on network failures, HTTP 4xx/5xx responses, JSON parse errors, and other exceptions. The orchestrator captures the thrown error via `Promise.allSettled` and stores `err.message` in `sourceResults[].error`. Common root causes:

- **Transient network error:** DNS failures, timeouts, or 5xx responses from upstream. Usually self-resolves on the next run (fetch retries 2x before giving up).
- **CSS selectors or API shape changed:** The site was redesigned or the API response format changed; parsers raise during `.text()`, `.json()`, or destructuring.
- **Rate limit or auth:** `HTTP 403` / `HTTP 429` on GitHub sources without a valid `GITHUB_TOKEN`.

**Note:** A source returning an empty array (no incidents on a healthy status page, no new blog posts this week) is **not** an error — it shows `status: "ok"` with `newItemCount: 0`.

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

**Context:** Without a token, the GitHub API allows 60 requests/hour. With `GITHUB_TOKEN`, the limit is 5000/hour. anthropic-watch makes one API call per GitHub source per run (7 sources use GitHub APIs).

**Fix:**

- Ensure `GITHUB_TOKEN` is set as a secret in the repository settings
- Check Actions workflow — the `scrape` job passes `GITHUB_TOKEN` via env
- Locally: `GITHUB_TOKEN=ghp_... node src/cli.js`

### State file corruption

**Symptoms:** Pipeline crashes on startup with JSON parse error.

**Context:** `loadState()` returns `{}` for missing files (ENOENT) but throws on malformed JSON.

**Diagnosis:** Check `state/last-seen.json` for syntax errors.

**Fix (preferred — restore from git history):**

`state/last-seen.json` is committed by the workflow after every successful run (see [ARCHITECTURE.md — State Persistence](ARCHITECTURE.md#state-persistence)), so a recent good copy lives in git:

```bash
# Inspect recent state commits
git log --oneline -20 -- state/last-seen.json

# Roll back one run
git checkout HEAD~1 -- state/last-seen.json

# Or roll back to a specific known-good commit
git checkout <sha> -- state/last-seen.json

git commit -m "chore: restore last-seen state from <sha>"
git push
```

This preserves existing `knownIds` so the next run doesn't flood feeds with "new" items.

**Fix (fallback — delete and rebuild):**

1. Delete the file — the pipeline will treat all items as new on the next run and rebuild state from scratch
2. Commit and push the fix
3. Expect a one-shot burst of "new" items across every source on the next scheduled run

### Feed duplicates

**Symptoms:** Same item appears multiple times in a feed.

**Context:** Deduplication key is `${id}|${source}`. An item is unique per-source by this key.

**Cause:**

- A scraper generates different IDs for the same content across runs. The `docs-hash` scraper changes ID on every content edit — this is by design.
- Two different sources track overlapping content with different keys.

**Fix:** Check the scraper's ID generation logic. For hash-based scrapers, duplicates are expected behavior — old items are eventually pushed out by the feed limit (100 for all, 50 per-source).

**Consumer-side duplicates (not a scraper bug):** If duplicates appear in your downstream application even though they don't appear in the published feed, you're deduplicating on `id` alone rather than on the composite `uniqueKey`. The [`@sefaertunc/anthropic-watch-client`](../packages/client) npm package handles this correctly — or see the **Programmatic Consumption** section of `docs/FEED-SCHEMA.md` for the raw pattern.

### Reddit source returns HTTP 403

**Symptoms:** One or more `reddit-*` sources show errors in the run report; error message reads `HTTP 403 for https://www.reddit.com/...` or `HTTP 403 for https://oauth.reddit.com/...`.

**Cause:** Reddit blocks unauthenticated traffic from datacenter IP ranges — including GitHub Actions runners. This has been Reddit policy since the 2023 API pricing changes and is persistent, not transient. The scraper's User-Agent is NOT the issue: the same request from a residential IP using the scraper's exact UA succeeds (HTTP 200 with `x-ratelimit-remaining: 99.0`). A 403 from a datacenter IP is an environmental block, not a scraper bug or UA drift. As of v1.4.1 the scraper uses OAuth2 against `oauth.reddit.com` to bypass the unauthenticated-IP block — see "Reddit sources return 0 items" below for credential setup.

**Fix:**

1. If the pipeline is running from a residential environment (local dev, self-hosted runner on a home network), unauthenticated access typically works — check that `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` are NOT set in that environment (they force the OAuth path even when unauthenticated would succeed).
2. If running from GitHub Actions or any datacenter context, configure OAuth credentials per the next entry. A persistent 403 on `oauth.reddit.com` (after credentials are configured correctly) would indicate Reddit has extended its datacenter-IP block to the OAuth endpoint — in that case, see `v1.4.1-reddit-diagnostic.md` for the escalation path (Path B source removal, or a self-hosted-runner split).
3. Do NOT emulate a browser UA — it is a Reddit ToS violation and does not bypass the datacenter block anyway.

### Reddit sources return 0 items

**Symptoms:** All `reddit-*` sources consistently report 0 items in the run report with `status: ok`.

**Cause:** Expected behavior when `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is not configured. This is a deliberate graceful-skip — forks and local dev sessions run cleanly without configuring OAuth. The scraper returns `[]` without any fetch when either env var is absent or empty.

**Fix:** Register a Reddit script-app and set the two secrets.

> **November 2025 policy change:** Reddit replaced self-service API-key issuance with the [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy). New apps are pre-gated — submitting the create-app form no longer mints credentials instantly; it triggers a manual review. Reddit's stated turnaround is ~7 days. Credentials issued before the policy change keep working.

1. Log in to Reddit from a residential IP (Reddit's app-creation page is also datacenter-IP-blocked). Go to `https://www.reddit.com/prefs/apps`.
2. Scroll to the bottom and click **"are you a developer? create an app..."**. Fill in: **Name** `anthropic-watch`, **App type** `script` (critical — the free client-credentials flow), **Redirect URI** `http://localhost:8080` (unused but required).
3. Submit the Responsible Builder Policy application via Reddit's Developer Support form (linked from the policy page). Use the field values and use-case text in [`reddit-oauth-setup.md`](reddit-oauth-setup.md). Wait for approval (~7 days).
4. Once approved, the credentials become available on the app detail page: the **client ID** (short ~14-char string directly under the words "personal use script") and the **secret** (~27-char string labeled "secret").
5. Add both as GitHub Actions secrets:

   ```bash
   gh secret set REDDIT_CLIENT_ID --body "<client-id>"
   gh secret set REDDIT_CLIENT_SECRET --body "<secret>"
   ```

The scraper picks up the credentials on the next cron run. No cost; Reddit's OAuth2 client-credentials tier is free. Rate limit is 100 QPM per OAuth client — well above our ≤5 reddit requests/run usage.

### Twitter sources return 0 items

**Symptoms:** All `twitter-*` sources consistently report 0 items in the run report.

**Cause:** Expected behavior when `TWITTERAPI_IO_KEY` is not configured. This is a deliberate graceful-skip — forks and local runs work without the key; the scraper returns `[]` without attempting any fetch when the env var is absent or empty.

**Fix:** Obtain a key from [twitterapi.io](https://twitterapi.io) and add it as a GitHub Actions secret named `TWITTERAPI_IO_KEY`. The scraper picks it up on the next cron run. Expected cost at current volume (8 accounts × 10 tweets × 30 days): ≈$0.36/month.

### github-commits scraper is missing a real commit

**Symptoms:** A human-authored commit is missing from the `gh-commits-*` feed.

**Cause:** The scraper filters commits whose `author.login` (or `commit.author.name` when login is absent) matches `/\[bot\]$/i`. A human commits from an account whose login happens to end in `[bot]` would be filtered. Classic-account bots without brackets (`renovate-bot`, `copilot-swe-agent`) slip THROUGH the filter, which is a different problem.

**Fix:** Set `excludeBots: false` on the specific source config in `src/sources.js` to disable the filter for that repo. Alternatively, if you suspect a specific login is matching when it shouldn't, check `src/scrapers/github-commits.js` and confirm the `BOT_LOGIN_RE` regex hasn't been broadened.

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
