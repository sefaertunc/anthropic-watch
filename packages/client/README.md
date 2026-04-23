# @sefaertunc/anthropic-watch-client

Official client library for consuming [anthropic-watch](https://github.com/sefaertunc/anthropic-watch) feeds. Version-gated fetch, correct composite-key deduplication, typed errors. Zero runtime dependencies.

## Installation

```bash
npm install @sefaertunc/anthropic-watch-client
```

Requires Node 18+ (for global `fetch` and `AbortController`).

## Quick start

```js
import {
  AnthropicWatchClient,
  filterNew,
} from "@sefaertunc/anthropic-watch-client";

const client = new AnthropicWatchClient();
const items = await client.fetchAllItems();

// Persist a Set of `uniqueKey` strings between runs — e.g. in a file or DB.
const seen = new Set(/* previouslySeenKeys */);
const fresh = filterNew(items, seen);

for (const item of fresh) {
  console.log(`[${item.source}] ${item.title} → ${item.url}`);
  seen.add(item.uniqueKey);
}
// …persist `seen` for the next run.
```

## Full consumption example

```js
import { readFile, writeFile } from "node:fs/promises";
import {
  AnthropicWatchClient,
  FeedVersionMismatchError,
  FeedFetchError,
  FeedMalformedError,
} from "@sefaertunc/anthropic-watch-client";

const STATE_PATH = "./state.json";
const client = new AnthropicWatchClient();

const prev = JSON.parse(await readFile(STATE_PATH, "utf8").catch(() => "[]"));
const seen = new Set(prev);

try {
  const items = await client.fetchAllItems();
  const fresh = client.filterNew(items, seen);

  console.log(`Found ${fresh.length} new items.`);
  for (const item of fresh) {
    console.log(`[${item.source}] ${item.title}`);
    seen.add(item.uniqueKey);
  }

  await writeFile(STATE_PATH, JSON.stringify([...seen], null, 2));
} catch (err) {
  if (err instanceof FeedVersionMismatchError) {
    console.error(
      `anthropic-watch feed version changed to ${err.actualVersion}; update this library.`,
    );
  } else if (err instanceof FeedFetchError) {
    console.error(
      `Feed unavailable (status=${err.status ?? "network"}): ${err.message}`,
    );
    // retry later
  } else if (err instanceof FeedMalformedError) {
    console.error(`Feed shape unexpected (${err.reason}): ${err.message}`);
  } else {
    throw err;
  }
}
```

The scraper's [`docs/FEED-SCHEMA.md`](https://github.com/sefaertunc/anthropic-watch/blob/main/docs/FEED-SCHEMA.md) contains a hand-rolled version of the same pattern without this library — useful for non-JS consumers or anyone evaluating the shape before adopting.

## API reference

### `new AnthropicWatchClient(options?)`

| Option    | Type           | Default                                         | Description                                                                     |
| --------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `baseUrl` | `string`       | `https://sefaertunc.github.io/anthropic-watch/` | Override the default feed host. Useful for self-hosters or local testing.       |
| `fetch`   | `typeof fetch` | `globalThis.fetch`                              | Custom fetch implementation. Used by tests or non-Node environments.            |
| `timeout` | `number`       | `10000`                                         | Request timeout in ms. Aborts the underlying fetch via an internal AbortSignal. |

Throws `TypeError` if no fetch implementation is available (e.g. Node <18 with no polyfill and no `options.fetch`).

### Methods

#### `client.fetchAllItems({ signal? }): Promise<Item[]>`

Fetches `feeds/all.json`. Validates `feed.version === "1.0"`, asserts `feed.items` is an array, returns `feed.items`.

#### `client.fetchSourceItems(sourceKey, { signal? }): Promise<Item[]>`

Fetches `feeds/{sourceKey}.json`. Same validation as `fetchAllItems`. Throws `TypeError` for empty or non-string `sourceKey`. The source key is URL-encoded.

#### `client.fetchRunReport({ signal? }): Promise<RunReport>`

Fetches `feeds/run-report.json`. Validates version, asserts `report.summary` and `report.sources` shape, returns the full report.

#### `client.filterNew(items, seenSet): Item[]`

Instance-method mirror of the pure helper. Returns items whose `uniqueKey` is not in `seenSet`.

### Pure helpers

#### `uniqueKey(item): string`

Returns `item.uniqueKey ?? \`${item.id}|${item.source}\``. The fallback is important: items archived from pre-v1.2.0 feeds don't have the `uniqueKey` field.

#### `filterNew(items, seenSet): Item[]`

Returns items whose `uniqueKey` is not in the provided `Set`. Throws `TypeError` if `seenSet` is not a `Set` — a common mistake worth failing loudly on.

#### `dedupe(items): Item[]`

Removes duplicates within an array, keeping the first occurrence of each `uniqueKey`. Stable (preserves input order of kept items).

### Constants

- `SUPPORTED_FEED_VERSION: "1.0"` — the only feed envelope version this library speaks.
- `DEFAULT_BASE_URL: "https://sefaertunc.github.io/anthropic-watch/"` — default feed host.

### Error classes

All errors inherit from `AnthropicWatchError`, so consumers can catch one class to handle everything this library throws:

```js
try {
  /* ... */
} catch (err) {
  if (err instanceof AnthropicWatchError) {
    // library error
  } else {
    throw err;
  }
}
```

| Class                      | Thrown when                           | Carries                                      |
| -------------------------- | ------------------------------------- | -------------------------------------------- |
| `AnthropicWatchError`      | Base class; not thrown directly       | `cause` if wrapping another error            |
| `FeedVersionMismatchError` | `feed.version !== "1.0"`              | `actualVersion`, `expectedVersion`           |
| `FeedFetchError`           | Network failure or HTTP non-2xx       | `url`, `status` (null for non-HTTP), `cause` |
| `FeedMalformedError`       | Response body not JSON or wrong shape | `url`, `reason`                              |

## Self-hosting

If you mirror anthropic-watch's feeds to a different host, construct the client with `baseUrl`:

```js
const client = new AnthropicWatchClient({
  baseUrl: "https://my-mirror.example.com/anthropic-watch/",
});
```

The client appends `feeds/{name}.json` to the base URL. Trailing slashes are normalized.

## Versioning

This library follows [semver](https://semver.org). Feed schema support is version-gated: the current `SUPPORTED_FEED_VERSION` is `"1.0"`. If anthropic-watch publishes a feed with a different version, the library throws `FeedVersionMismatchError` rather than silently returning items of unknown shape.

When anthropic-watch bumps the feed envelope version (currently planned for a hypothetical v2.0 release), a new major version of this library will support the new version. Consumers can pin to a library major version matching the feed schema they understand.

## Relation to the scraper

The scraper itself — [anthropic-watch](https://github.com/sefaertunc/anthropic-watch) — is infrastructure (GitHub Actions cron + GitHub Pages static hosting) and is not published to npm. Only this client library is.

This is an **unofficial community library**. Anthropic does not maintain it. If Anthropic ever ships a first-party feed consumer, defer to that.

## License

MIT
