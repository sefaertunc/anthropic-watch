# @sefaertunc/anthropic-watch-client

[![npm version](https://img.shields.io/npm/v/@sefaertunc/anthropic-watch-client?color=cb3837&logo=npm)](https://www.npmjs.com/package/@sefaertunc/anthropic-watch-client)
[![node: 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=nodedotjs)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](./package.json)
[![license: MIT](https://img.shields.io/npm/l/@sefaertunc/anthropic-watch-client)](../../LICENSE)

[Install](#installation) · [Quick start](#quick-start) · [API](#api) · [Scraper repo](https://github.com/sefaertunc/anthropic-watch)

Official client library for consuming [anthropic-watch](https://github.com/sefaertunc/anthropic-watch) feeds. Version-gated fetch, correct composite-key deduplication, typed errors. Zero runtime dependencies.

## What this is

**This package** reads anthropic-watch's published feeds and is distributed on npm. Use it in apps that consume Claude Code / Anthropic upstream-change data.

**The scraper** ([anthropic-watch](https://github.com/sefaertunc/anthropic-watch)) produces those feeds. It runs on a GitHub Actions cron, publishes to GitHub Pages, and is **not** on npm — it is infrastructure, not a package.

This is an unofficial community library. Anthropic does not maintain it. If Anthropic ships a first-party feed consumer, defer to that.

## Why

- **Correct deduplication by default** — composite `${id}|${source}` keys with fallback for archived pre-v1.2.0 feeds. Downstream apps that dedupe on `id` alone will drop real items when two sources happen to share an ID.
- **Version-gated fetch** — refuses to return items from a feed envelope it doesn't understand (throws `FeedVersionMismatchError`). Upgrading the scraper's schema doesn't silently corrupt your consumer.

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

## API

### `new AnthropicWatchClient(options?)`

| Option    | Type           | Default                                         | Description                                                      |
| --------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `baseUrl` | `string`       | `https://sefaertunc.github.io/anthropic-watch/` | Override the default feed host — self-hosters or local testing.  |
| `fetch`   | `typeof fetch` | `globalThis.fetch`                              | Custom fetch implementation, used by tests or non-Node runtimes. |
| `timeout` | `number`       | `10000`                                         | Request timeout in ms, wired through an internal `AbortSignal`.  |

Throws `TypeError` if no fetch is available (Node <18 with no polyfill and no `options.fetch`).

### Methods

| Method                                     | Returns              | Description                                                                    |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------ |
| `fetchAllItems({ signal? })`               | `Promise<Item[]>`    | Fetches `feeds/all.json`, validates envelope version, returns `feed.items`.    |
| `fetchSourceItems(sourceKey, { signal? })` | `Promise<Item[]>`    | Fetches `feeds/{sourceKey}.json`. URL-encoded. Throws on empty/non-string key. |
| `fetchRunReport({ signal? })`              | `Promise<RunReport>` | Fetches `feeds/run-report.json`, validates shape, returns the full report.     |
| `filterNew(items, seenSet)`                | `Item[]`             | Items whose `uniqueKey` is not in `seenSet`. Mirror of the pure helper.        |

### Pure helpers

| Helper                      | Description                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `uniqueKey(item)`           | Returns `item.uniqueKey` if present, else `` `${item.id}                                                                                | ${item.source}` `` — the fallback matters for items archived from pre-v1.2.0 feeds. |
| `filterNew(items, seenSet)` | Items whose `uniqueKey` is not in `seenSet`. Throws `TypeError` if `seenSet` is not a `Set` — a common mistake worth failing loudly on. |
| `dedupe(items)`             | Removes duplicates within an array, keeping the first occurrence of each `uniqueKey`. Stable.                                           |

### Constants

- `SUPPORTED_FEED_VERSION` — `"1.0"`. The only feed envelope version this library speaks.
- `DEFAULT_BASE_URL` — `"https://sefaertunc.github.io/anthropic-watch/"`.

### Errors

All errors extend `AnthropicWatchError`, so `catch (err) { if (err instanceof AnthropicWatchError) { … } }` catches everything this library throws.

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

## Related

- [anthropic-watch](https://github.com/sefaertunc/anthropic-watch) — the scraper that produces these feeds
- [Feed schema reference](https://github.com/sefaertunc/anthropic-watch/blob/main/docs/FEED-SCHEMA.md) — JSON / RSS / OPML schema for hand-rolled consumers
- [Changelog](./CHANGELOG.md) — release notes

## License

MIT
