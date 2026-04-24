# Changelog

## [1.0.2] - 2026-04-24

README-only refresh for the npm landing page. No code changes.

### Changed

- Added badge row (npm version, Node 18+, zero runtime deps, license).
- Added a compact top-nav line (Install · Quick start · API · Scraper repo).
- Hoisted "What this is" callout and added a two-bullet "Why" block describing correct-dedup-by-default and version-gated-fetch value.
- Compacted the API reference into scannable tables (methods, helpers, errors) instead of per-method prose blocks.
- Added a "Related" section linking the scraper repo, feed-schema docs, and changelog.

No API, behavior, or type changes. Consumers pinned to `^1.0.0` pick this up automatically.

## [1.0.1] - 2026-04-23

Paired release with `anthropic-watch` v1.4.0.

### Changed

- **Widened `Item.sourceCategory` and `SourceResult.category` type unions** from `'core' | 'extended'` to `'core' | 'extended' | 'community'`. Reflects the new `community` category introduced by `anthropic-watch` v1.4.0, which categorizes third-party sources (Reddit, Hacker News, Twitter/X, and GitHub commits on Anthropic-owned repositories that ship via direct commits rather than tagged releases). Runtime behavior is unchanged — the client has always passed through whatever string is present in the feed; this is a type-signature-only update for TypeScript consumers.

### Migration

No code changes required. TypeScript consumers pinned to client `^1.0.0` pick up the widened type automatically. Consumers with strict enumerations (`sourceCategory === 'core' || sourceCategory === 'extended'` as exhaustive checks) should update to include `'community'` or, better, handle unknown category values gracefully — the schema contract treats `category` as extensible.

## [1.0.0] - 2026-04-23

Initial release of `@sefaertunc/anthropic-watch-client` — the official client library for consuming anthropic-watch feeds.

### Added

- `AnthropicWatchClient` class with `fetchAllItems`, `fetchSourceItems`, `fetchRunReport`, `filterNew`.
- Pure helpers: `uniqueKey`, `filterNew`, `dedupe`.
- Typed error hierarchy: `AnthropicWatchError`, `FeedVersionMismatchError`, `FeedFetchError`, `FeedMalformedError`.
- Full JSDoc type annotations; `.d.ts` declarations generated at publish time for TypeScript users.
- Zero runtime dependencies.
- Supports Node 18+.
- Version-gated on anthropic-watch feed schema `"1.0"`. Any other version throws `FeedVersionMismatchError`.

### Compatibility

- Tested against `anthropic-watch@1.3.0` reference fixtures.
- Fixture drift policy: client fixtures are regenerated to match producer fixtures on every feed schema change. Enforced by `packages/client/test/fixtures.test.js` asserting byte-identity with `docs/fixtures/`.
