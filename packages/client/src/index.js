// Public API — @sefaertunc/anthropic-watch-client
export { AnthropicWatchClient } from "./client.js";
export {
  uniqueKey,
  filterNew,
  dedupe,
  SUPPORTED_FEED_VERSION,
  DEFAULT_BASE_URL,
} from "./client.js";
export {
  AnthropicWatchError,
  FeedVersionMismatchError,
  FeedFetchError,
  FeedMalformedError,
} from "./errors.js";

// Re-export every JSDoc typedef from ./types.js so that `dist/index.d.ts`
// surfaces `Item`, `FeedEnvelope`, `RunReport`, etc. to TypeScript consumers.
export * from "./types.js";
