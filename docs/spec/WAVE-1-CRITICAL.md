# Wave 1 — Critical fixes (plan mode)

**Contains:** Issues 1, 2, 3, 4.
**Execution mode:** Plan mode — coupled test/contract changes across 7+ files. Review before applying.
**Worclaude contract:** No structural breakage (see end of doc).

---

## Issue 1 — Silent error swallowing

**Verdict:** Confirmed
**Evidence:** `catch { return []; }` at `blog-page.js:258-260`, `github-releases.js:39-41`, `github-changelog.js:60-62`, `npm-registry.js:49-51`, `status-page.js:36-38`, `docs-page.js:116-118`. Orchestrator heuristic at `src/index.js:120-124`.

**Fix:** Remove the scraper-level try/catch entirely. The orchestrator already captures thrown errors via the rejected-promise path at `src/index.js:157-180` and stores them into `sourceResults[].error`. No return-contract change needed — scrapers stay returning `Array<Item>` on success and _throw_ on failure.

**Files changed:**

- `src/scrapers/blog-page.js` — remove try/catch wrapper
- `src/scrapers/github-releases.js` — same
- `src/scrapers/github-changelog.js` — same
- `src/scrapers/npm-registry.js` — same
- `src/scrapers/status-page.js` — same
- `src/scrapers/docs-page.js` — same
- `src/index.js` — remove the "0 items + hasKnownIds" heuristic at `:120-124` (obsolete once real errors throw)
- `docs/ARCHITECTURE.md:44-48` — scraper contract text ("returns `Array<Item>` on success, `[]` on error" → "returns `Array<Item>` on success, throws on error")
- `docs/ARCHITECTURE.md:141-143` — failure detection description
- `docs/TROUBLESHOOTING.md:18-25` — "returned 0 items (possible error)" section loses relevance; replace with how real error messages surface in `run-report.sources[].error`

**Test updates:**

- `test/scrapers/github-releases.test.js:105, 113` — `expect(items).toEqual([])` → `await expect(scraper(source)).rejects.toThrow()`
- `test/scrapers/status-page.test.js:105, 113` — same
- `test/scrapers/npm-registry.test.js:86` — same
- `test/scrapers/github-changelog.test.js:85, 93` — same
- `test/scrapers/blog-page.test.js:164, 178` — same
- `test/scrapers/docs-page.test.js:140, 153` — same
- `test/e2e/error-resilience.test.js:145-209` — rewrite: malformed fixture should now produce `sourceResults[].error !== null` on first run

**Effort:** M

---

## Issue 2 — First-run silent failure

**Verdict:** Confirmed
**Evidence:** `src/index.js:120-121` — `if (items.length === 0 && hasKnownIds)` skips failure detection on first run. `error-resilience.test.js:179-185` currently asserts the wrong behavior ("First run with no knownIds — treated as success") as correct.

**Fix:** Once Issue 1 is in, thrown errors are caught by the rejected-promise path regardless of `hasKnownIds`. No additional orchestrator change strictly needed — but audit `runPipeline` to confirm the rejected-promise branch at `src/index.js:157-180` increments `consecutiveFailures` and sets source status to `"error"` irrespective of first-run state. Add an assertion test to lock this in.

**Test updates:**

- `test/e2e/error-resilience.test.js:175-185` — flip assertion: first-run with bad fixture produces `consecutiveFailures === 1` and source status `error`
- **NEW TEST:** new source added + scraper throws on first run → recorded as failure, not silent success

**Effort:** S

---

## Issue 3 — `github-changelog` false positives

**Verdict:** Confirmed
**Evidence:** `github-changelog.js:31-34` hashes the entire file. Known IDs in `state/last-seen.json` are 12-char hash prefixes. The scraper already extracts the first `## ` heading as `title` at `github-changelog.js:46,50`.

**Fix:** Change the item ID from a file-content hash to the first `## ` heading text (stripped of `## ` prefix and whitespace). Examples: `"## 2.1.109"` → `"2.1.109"`, `"## [Unreleased]"` → `"[Unreleased]"`.

**Edge cases:**

- `[Unreleased]` sections accumulate edits under one ID; when replaced by a version heading, a new item emits. Intended.
- If no `## ` heading is found, fall back to the 12-char hash of the full file and use a synthesized title like `"(no heading — {first 40 chars})"`.
- One-shot migration cost: 3 changelog sources (`claude-code-changelog`, `agent-sdk-ts-changelog`, `agent-sdk-py-changelog`) will each emit one false-positive item on the first run after the fix. Acceptable; call out in the release note.

**Files changed:**

- `src/scrapers/github-changelog.js` — replace `id: hash` with heading-derived ID; keep hash as fallback
- `docs/SOURCES.md` — update `github-changelog` description (IDs are heading-derived)

**Test updates:**

- `test/scrapers/github-changelog.test.js:96-109` — replace the "different content produces different hash" test with three cases:
  - Different content under the same heading → same ID
  - Different heading → different ID
  - No heading → hash fallback

**Effort:** S

---

## Issue 4 — `docs-page` docs-hash false positives

**Verdict:** Confirmed
**Decision:** **Option 2 — reclassify as model catalog.**
**Evidence:** `docs-page.js:68-96` hashes stripped body. `docs/SOURCES.md:45` documents expected churn.

**Fix:** Add a new parse mode `model-table` to `docs-page.js`. Parse the model listing on the models reference page (`https://docs.anthropic.com/en/docs/about-claude/models`) and emit one item per model.

**Prerequisite — feasibility check (first step of implementation):**

- Capture a current fixture of the models page HTML.
- Inspect via cheerio to confirm the model listing is present in the initial server-rendered HTML. The docs site uses client-side rendering, but the existing `docs-hash` mode already works, so at least some content is in the initial render.
- If the model listing is _not_ in the initial render, fall back to option 3 (narrow the hash to a stable region such as the models-api anchor). Document the fallback decision in the implementation PR and do not proceed with option 2.

**Item shape (per model entry):**

- `id` — stable model API identifier, e.g., `claude-opus-4-5`, `claude-sonnet-4-5`
- `title` — display name, e.g., `"Claude Opus 4.5"`
- `date` — published/updated date if present in the page; else `null` (allowed per `FEED-SCHEMA.md`)
- `url` — models page + anchor to the model row if available; else the page URL
- `snippet` — short one-line description if present on the page; else omitted

**Files changed:**

- `src/scrapers/docs-page.js` — add `parseModelTable()` alongside `parseDocsHash()`; dispatch based on source `mode` field
- `src/sources.js` — change `docs-release-notes` to use `mode: "model-table"`
- `docs/SOURCES.md:36-45` — update source description and parse-mode docs
- `docs/WORCLAUDE-INTEGRATION.md:101` — update Impact Mapping row for `docs-release-notes` (still "Release notes" category; now one item per model version)
- `docs/ARCHITECTURE.md` — document the new parse mode in the docs-page Parse Modes section

**Test updates:**

- **NEW FIXTURE:** `test/fixtures/docs-release-notes.html` — captured current models page HTML (drives all new tests)
- **NEW TEST** in `test/scrapers/docs-page.test.js`: `parseModelTable` against fixture → non-empty items array, each item has stable id/title/url
- **NEW TEST:** stable-ID guarantee — run `parseModelTable` twice against the same fixture → identical ids
- **NEW TEST:** malformed HTML (no model listing) → throws, does not emit empty
- Keep existing `parseDocsHash` tests for the fallback path (option 3 if feasibility fails)

**Migration:** Existing state has one hash-based ID for `docs-release-notes`. After the switch, first run emits one item per current model (~5–10). Call out in release note.

**Worclaude contract:** `run-report.sources[]` is indexed by `key`, unchanged. Item shape stays within schema (id, title, date, url, snippet). No version bump needed.

**Effort:** M

---

## Issue 5 — `source.fixtureFileFull` (rejected)

**Verdict:** REJECTED — not a bug.

`test/helpers/create-test-config.js:18-20` assigns `fixtureFileFull`. `test/capture-fixtures.js:79-109` emits `{key}-full.json`. `test/scrapers/npm-registry.test.js:27` passes it per-test. `docs/SOURCES.md:89` and `docs/ADDING-SOURCES.md:83` document it. The field is wired up. Tests are deterministic; none call `createTestConfigs()`.

Optional future cleanup (out of scope for v1.0.1): delete the unused `createTestConfigs()` helper or commit top-level fixtures + wire it into an e2e test.

**Effort:** 0

---

## Wave 1 execution notes

**Dependencies:**

- Issue 2 depends on Issue 1 — ship together.
- Issues 3 and 4 are independent of 1/2 and of each other.

**Suggested ordering within the PR:**

1. Land Issue 1 scraper changes + test updates (biggest blast radius first; all scraper tests must pass before continuing).
2. Verify Issue 2 behavior; add the new first-run-failure test.
3. Land Issue 3 (heading-derived ID).
4. Feasibility-check Issue 4 → if model listing is in initial render, implement `model-table` parse mode; else fall back to narrowing the hash (option 3) and note in PR.

**Test summary:**

- 6 existing scraper tests → `[]` assertions flip to `rejects.toThrow`
- `error-resilience.test.js` rewritten
- 3 new changelog ID tests
- 3 new docs-page model-table tests + 1 new fixture
- 1 new first-run-failure e2e test

**Docs touched:**

- `docs/ARCHITECTURE.md` — Issues 1, 4
- `docs/TROUBLESHOOTING.md` — Issue 1
- `docs/SOURCES.md` — Issues 3, 4
- `docs/WORCLAUDE-INTEGRATION.md` — Issue 4

**Worclaude contract:** `run-report.sources[].error` content improves (specific messages instead of generic "returned 0 items"). Changelog and docs item IDs migrate to stable values — one-shot false-positive per migrated source, accepted. Schema version stays `"1.0"`.

**Effort total:** 2×M + 2×S (+ Issue 5: 0).

**Constraints:**

- Node 20+, ESM, minimal deps
- Tests deterministic — no live network
- `state/last-seen.json` migration backward-compatible — existing entries load unchanged
