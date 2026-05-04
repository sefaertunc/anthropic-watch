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

### Reddit sources return errors or 0 items

**Symptoms:** One or more `reddit-*` sources show errors in the run report (e.g. `HTTP 403 for https://www.reddit.com/...`) or report 0 items consistently.

**Cause:** Reddit's `*.json` endpoints (and the `oauth.reddit.com` API) block traffic from datacenter IP ranges, including GitHub Actions runners — a Reddit policy since the 2023 API pricing changes. The Atom RSS endpoints (`/r/<sub>/<mode>.rss`) are NOT subject to that block, and that's what the scraper uses as of v1.5.1.

History: v1.4.1 added an OAuth2 flow against `oauth.reddit.com` to bypass the unauthenticated-IP block on `*.json`. After Reddit's November 2025 [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) gated all new app registrations behind manual review, this project's RBP application was denied twice with no specifics. v1.5.1 swapped to public Atom RSS — bypassing both the OAuth gate and the datacenter-IP block on `*.json` simultaneously.

**Fix:**

1. Confirm the failing source's URL ends in `.rss` (not `.json`) — `src/scrapers/reddit-subreddit.js` since v1.5.1 builds `https://www.reddit.com/r/<sub>/<mode>.rss?t=<window>&limit=<n>`.
2. A persistent 403/429 on the `.rss` endpoint from a runner would indicate Reddit has extended its datacenter-IP block to RSS as well. Escalation paths in that unlikely case: (a) remove the five `reddit-*` sources from `src/sources.js` (update source-count references and tests accordingly), or (b) split the Reddit leg onto a self-hosted runner on a residential IP (introduces operational surface this project deliberately avoids).
3. The scraper has no graceful-skip path — there are no credentials to be missing. A non-2xx response or unparseable Atom body throws per Rule 4 and surfaces in the run report.
4. Do NOT emulate a browser UA — it is a Reddit ToS violation and does not bypass the datacenter block on `*.json` anyway.

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

### Feed Health panel shows red "Run history depth"

**Symptoms:** The dashboard's Feed Health section shows `runHistoryDepth` in red ("fired"), or `feed-health.json` reports `runHistoryDepth.state === "fired"`.

**Cause:** `run-history.json` length dropped from yesterday by more than 5 entries. This is the v1.4.2 truncation-bug signature — the canonical case is a hydration step regression that overwrites accumulated history with a single fresh entry.

**Fix:**

1. Inspect the latest GitHub Actions run for the `scrape.yml` workflow. Confirm the gh-pages hydration step pulled `public/feeds/` before the scraper ran (look for the second `actions/checkout@v4` step targeting the `gh-pages` ref). A missing or broken hydration step is the primary cause.
2. Check `feed-health.json.indicators.runHistoryDepth.previous` and `current` to confirm the magnitude of the drop.
3. If hydration is healthy, fetch `https://sefaertunc.github.io/anthropic-watch/feeds/run-history.json` and compare against `feed-health.json` to confirm the drop is real (not a stale dashboard).

A `warning` state on this indicator is expected during the post-v1.4.2 seeding period (run-history climbing 3 → 90 over ~12 weeks). Only `fired` indicates regression.

### Feed Health panel shows red "Cron freshness"

**Symptoms:** Dashboard's Feed Health section shows `cronFreshness` in red.

**Cause:** The `cronFreshness` state is computed at read time from `feed-health.json.generatedAt`. Red means the artifact is more than 36 hours stale. The JSON itself does not publish a state for this indicator — the dashboard derives it. GitHub Actions free-tier cron drift typically tops out around 2–3 hours; >36 hours indicates the workflow is failing or disabled.

**Fix:**

1. `gh run list --workflow=scrape.yml --limit 5` — confirm whether recent runs are succeeding.
2. If runs are failing, open the most recent failed run and inspect logs.
3. If no runs are listed, confirm the workflow is enabled in repo settings.
4. The 24h `warning` threshold accommodates documented cron drift; only `fired` (>36h) indicates a genuine outage.

### Per-source continuity warning fired

**Symptoms:** `feed-health.json.indicators.perSourceFeedContinuity.state` is `warning` (1–2 sources) or `fired` (≥3 sources). The `details` array names the affected sources.

**Cause:** A source's per-source feed lost retained items unexpectedly — yesterday's items did not survive into today's feed despite there being room (less than 50 new items pushed nothing out).

**What it does NOT mean:**

- **Cap-saturated eviction:** a source at the 50-item cap with 5 new items pushing 5 old ones out is normal — the membership check accounts for `expectedRetained = min(yesterday.length, max(0, 50 - todayNewCount))`.
- **Legitimate empty days:** zero new items, all 50 of yesterday's items retained, `retainedCount = 50, expectedRetained = 50`. Not flagged.

**Known false-positive class:** changelog sources (`*-changelog`) where items move from `[Unreleased]` to a versioned section change ID (heading-derived), looking like non-retention. Rate is ~1–2 events per active changelog source per month. Cross-reference `details[].source` against the source's recent releases — if the affected source published a new version yesterday, this is likely the cause and will resolve on the next run.

**Source config changes** (e.g., `excludeBots: false → true`) can legitimately shrink retained items. If you intentionally tighten a source filter, delete the source's per-source feed entry from `gh-pages` before deploy to reset the baseline.

**How to investigate:** `details[]` entries include `yesterdayCount`, `todayCount`, `retainedCount`, `expectedRetained`. If `todayCount === 0` and `yesterdayCount > 0`, the source likely returned an empty result today (transient API issue or scraper regression). If `todayCount` is healthy but `retainedCount` is 0, look at item IDs to see whether the IDs themselves changed shape.

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
