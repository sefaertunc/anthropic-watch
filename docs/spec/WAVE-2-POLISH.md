# Wave 2 — Polish / cleanup (auto-accept)

**Contains:** Issues 6, 7, 8, 9, 10, 11, 12, 13, 14.
**Execution mode:** Auto-accept — all S-sized, mostly isolated edits.
**Ship target:** v1.0.1.

---

## Issue 6 — Redundant `test` job in `scrape.yml`

**Fix:** Remove the `test` job from `scrape.yml` and drop `needs: test` from the `scrape` job. Trust `test.yml` on push/PR.

**Files changed:**

- `.github/workflows/scrape.yml` — remove test job, drop `needs`
- `test/unit/workflow.test.js:56-61` — update assertions (`workflow.jobs.test` no longer exists; `workflow.jobs.scrape.needs` drops)

**Effort:** S

---

## Issue 7 — User-Agent version drift

**Evidence:** `fetch-with-retry.js:5` → `"anthropic-watch/0.4"`. `package.json:3` → `"1.0.0"`. `test/capture-fixtures.js:22` also hardcodes `0.4`.

**Fix:** Read version from `package.json` at module load via ESM import attributes (Node 20.10+):

```js
import pkg from "../package.json" with { type: "json" };
const USER_AGENT = `anthropic-watch/${pkg.version}`;
```

Fallback if CI pins Node below 20.10: read via `fileURLToPath` + `readFileSync` (sync is fine at module init).

**Files changed:**

- `src/fetch-with-retry.js`
- `test/capture-fixtures.js:22` — same treatment

**Test updates:**

- **NEW TEST** in `test/unit/fetch-with-retry.test.js`: assert User-Agent header contains current `pkg.version`, not a hardcoded string. Regression guard against future drift.

**Effort:** S

---

## Issue 8 — `github-releases` `per_page=10` too tight

**Fix:** Bump `per_page=30`. No pagination — edge cases (unbounded first run, force-push rewrites) aren't worth the complexity.

**Files changed:**

- `src/scrapers/github-releases.js:21`

**Tests:** None required (existing tests assert on item content, not count semantics).

**Effort:** S

---

## Issue 9 — No `git pull --rebase` before `git push`

**Fix:** Wrap the commit+push step in a short retry loop with rebase:

```yaml
for i in 1 2 3; do
git pull --rebase origin main && git push && exit 0
sleep $((i * 5))
done
exit 1
```

If all retries fail, the workflow fails loudly. `peaceiris/actions-gh-pages@v4` at `scrape.yml:62-67` is unaffected (publishes to `gh-pages`, independent).

**Files changed:**

- `.github/workflows/scrape.yml`
- `test/unit/workflow.test.js` — regex assertion that the scrape step contains `pull --rebase`

**Effort:** S

---

## Issue 10 — Run history cap 30 → 90

**Files changed:**

- `src/index.js:295` — `.slice(0, 30)` → `.slice(0, 90)`
- `docs/FEED-SCHEMA.md:202, :226` — "Last 30" → "Last 90"

**Tests:** None required (no existing assertion on count).

**Effort:** S

---

## Issue 11 — Missing `public/.nojekyll`

**Fix:** Create empty `public/.nojekyll` as defensive measure. `peaceiris/actions-gh-pages@v4` already creates it on the publish branch by default — this is belt-and-braces.

**Effort:** S

---

## Issue 12 — `parseNextjsRsc` fragility docs

**Fix:** Add a "Known Brittleness" paragraph in `docs/ARCHITECTURE.md` under the blog-page Parse Modes section covering:

- Dependency on Next.js's internal `self.__next_f.push` chunk format
- HTML fallback path (`html-cards`) as safety net
- Re-validate on Anthropic site redesigns

Cross-link from `docs/SOURCES.md:23` to avoid duplication.

**Effort:** S (docs only)

---

## Issue 13 — Feed merge semantics docs

**Fix:** Add a "Merge Semantics" subsection to `docs/FEED-SCHEMA.md`:

- Dedup key: `id|source`
- Ordering: new items prepended before existing
- Winner on conflict: first-seen (new wins — latest snippet/title replaces stale persistence)

Cross-link from `docs/ARCHITECTURE.md:169-178` (which describes accumulation but not the conflict rule).

**Effort:** S (docs only)

---

## Issue 14 — State backup

**Fix (simpler than original plan):** Skip the `state/backups/` directory. Rely on two safety nets already available:

1. Git history — `state/last-seen.json` is committed daily at `scrape.yml:59`. Recovery = `git checkout HEAD~N state/last-seen.json`.
2. _(Optional)_ Upload `state/last-seen.json` as a GitHub Actions artifact with 30-day retention (`actions/upload-artifact@v4`). Cleaner than in-repo backups — no daily diff noise, no prune logic.

**Files changed:**

- `docs/TROUBLESHOOTING.md:60-72` — expand "unrecoverable state" recovery section with `git checkout HEAD~1 state/last-seen.json` recipe
- _(Optional)_ `.github/workflows/scrape.yml` — add `actions/upload-artifact@v4` step

**Effort:** S (docs only) or S+ (with artifact upload)

---

## Wave 2 execution notes

All issues independent — batch into one PR, or split if smaller diffs are preferred.

**Shared file caution:** Issues 6 and 9 both modify `test/unit/workflow.test.js`. Land them in a single commit to avoid conflicts.

**Effort total:** 9 × S.

**Constraints:**

- Node 20+, ESM, minimal deps
- Tests deterministic — no live network
- `state/last-seen.json` backward-compatible
