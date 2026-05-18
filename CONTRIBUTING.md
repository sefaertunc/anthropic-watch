# Contributing to Anthropic Watch

Thanks for your interest in contributing! This project monitors public Anthropic and community sources and publishes structured feeds. Contributions that add new sources, fix broken scrapers, or improve feed quality are especially welcome.

## Getting Started

```bash
git clone https://github.com/sefaertunc/anthropic-watch.git
cd anthropic-watch
npm install
```

Run the scraper locally:

```bash
node src/index.js

# With GitHub API auth (avoids rate limits)
GITHUB_TOKEN=ghp_xxx node src/index.js
```

Run tests:

```bash
npm test
```

## How to Contribute

### Reporting a broken scraper

If a source is returning 0 items or incorrect data, open an issue with:

- Which source is broken (use the source key from `src/sources.js`)
- What you expected vs what happened
- The error from `run-report.json` or GitHub Actions logs, if available

### Fixing a broken scraper

Scrapers break when a source changes its HTML structure. To fix one:

1. Inspect the source URL — find the new CSS selectors or API structure
2. Update the selectors in `src/sources.js`
3. Refresh the fixture: `node test/capture-fixtures.js <source-key>`
4. Update tests if needed
5. Run `npm test` to verify
6. Submit a PR

### Adding a new source

Follow the step-by-step guide in [docs/ADDING-SOURCES.md](docs/ADDING-SOURCES.md). The short version:

1. Add a source config to `src/sources.js`
2. Investigate the source to find selectors or API structure
3. Capture a fixture
4. Add tests
5. Update `docs/SOURCES.md`
6. Submit a PR

### Improving feed quality

If feed output is missing fields, has bad date parsing, or has formatting issues — PRs welcome. Make sure the RSS validator test still passes.

## Development Guidelines

- **ESM only** — use `import/export`, no `require()`
- **No build step** — plain JavaScript, no TypeScript, no bundler
- **Minimal dependencies** — don't add a package if the standard library can do it
- **Scraper contract** — every scraper exports `async function scrape(sourceConfig)` and returns `Array<Item>`. Scrapers **throw on failure** (HTTP non-2xx, parse errors); the orchestrator's `Promise.allSettled` aggregates errors. An empty array means "no items right now," not "an error." Wrapping scraper logic in `try/catch { return [] }` is forbidden — that was the v1.0.1 silent-failure root cause.
- **Use `fetchSource()`** — not bare `fetch()`. This enables fixture-based testing.
- **Use `parseDate()`** — not inline `new Date()`. This ensures consistent date normalization.
- **Logging** — use `src/log.js`, not `console.log` directly

## Testing

All changes must pass existing tests. If you're adding a new source or changing a scraper, add tests for it.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Refresh fixtures from live sources (manual, not in CI)
npm run test:live
```

Key test principles:

- Tests use fixtures, not live network calls
- The "no changes" test must never false-positive — run twice with the same fixtures and verify 0 new items
- One source failing must not crash the pipeline

## Pull Requests

- Branch from `develop` (the integration branch). Hotfixes that need to bypass `develop` may branch from `main` as `feat/*`.
- Name your branch `feat/<short-description>` — PRs targeting `main` from any other branch name will be rejected by the `Branch name check` workflow (`dependabot/*` and `renovate/*` branches are allowlisted for automated dependency PRs)
- Keep PRs focused — one source or one fix per PR
- Include the source key in the PR title if it's source-specific (e.g. "fix: update selectors for blog-engineering")
- Make sure `npm test` passes before submitting
- Describe what changed and why in the PR description

## Releases

Two artifacts ship from this repo through orthogonal pipelines:

- **Scraper (`anthropic-watch`)** — bump the root `package.json` version on `develop` through `/sync`, merge the resulting `release: vX.Y.Z` PR to `main`. `.github/workflows/release.yml` reads the new version, creates the `vX.Y.Z` tag on the merge commit, and publishes a GitHub Release with the extracted `CHANGELOG.md` section. The scraper is not on npm — it's infrastructure distributed as tagged GitHub Releases.
- **Client (`@sefaertunc/anthropic-watch-client`)** — bump `packages/client/package.json`, land on `main` via the normal develop → main flow. `.github/workflows/publish-client.yml` auto-fires on the path change (or trigger it manually via Actions → "Publish Client" → "Run workflow"), publishes to npm with `--provenance --access public`, and skips cleanly if the version is already published. Verify the release via `npm view @sefaertunc/anthropic-watch-client@<version> dist.signatures`.

The two pipelines are independent. A scraper-only PR fires `release.yml` and not `publish-client.yml`; a client-only PR fires `publish-client.yml` and not `release.yml`; a PR touching both fires both.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind and constructive.

## Questions?

Open an issue or start a discussion. No question is too small.
