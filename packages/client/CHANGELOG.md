# Changelog

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
