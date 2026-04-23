import {
  FeedVersionMismatchError,
  FeedFetchError,
  FeedMalformedError,
} from "./errors.js";

// These are the source of truth; src/index.js re-exports them. Declaring
// them here (rather than in both places) prevents drift.
export const SUPPORTED_FEED_VERSION = "1.0";
export const DEFAULT_BASE_URL = "https://sefaertunc.github.io/anthropic-watch/";

/**
 * @param {import('./types.js').Item} item
 * @returns {string}
 */
export function uniqueKey(item) {
  return item.uniqueKey ?? `${item.id}|${item.source}`;
}

/**
 * @param {import('./types.js').Item[]} items
 * @param {Set<string>} seenSet
 * @returns {import('./types.js').Item[]}
 */
export function filterNew(items, seenSet) {
  if (!(seenSet instanceof Set)) {
    throw new TypeError("filterNew: seenSet must be a Set");
  }
  return items.filter((item) => !seenSet.has(uniqueKey(item)));
}

/**
 * @param {import('./types.js').Item[]} items
 * @returns {import('./types.js').Item[]}
 */
export function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = uniqueKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export class AnthropicWatchClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout] - milliseconds
   */
  constructor(options = {}) {
    this.baseUrl =
      (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "") + "/";
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeout = options.timeout ?? 10000;

    if (typeof this.fetch !== "function") {
      throw new TypeError(
        "AnthropicWatchClient: no fetch implementation available. " +
          "Use Node 18+ or pass a custom fetch via options.fetch.",
      );
    }
  }

  /**
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<import('./types.js').Item[]>}
   */
  async fetchAllItems({ signal } = {}) {
    const url = `${this.baseUrl}feeds/all.json`;
    const feed = await this.#fetchJson(url, { signal });
    this.#assertFeedShape(feed, url);
    return feed.items;
  }

  /**
   * @param {string} sourceKey
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<import('./types.js').Item[]>}
   */
  async fetchSourceItems(sourceKey, { signal } = {}) {
    if (typeof sourceKey !== "string" || sourceKey.length === 0) {
      throw new TypeError(
        "fetchSourceItems: sourceKey must be a non-empty string",
      );
    }
    const url = `${this.baseUrl}feeds/${encodeURIComponent(sourceKey)}.json`;
    const feed = await this.#fetchJson(url, { signal });
    this.#assertFeedShape(feed, url);
    return feed.items;
  }

  /**
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<import('./types.js').RunReport>}
   */
  async fetchRunReport({ signal } = {}) {
    const url = `${this.baseUrl}feeds/run-report.json`;
    const report = await this.#fetchJson(url, { signal });
    this.#assertRunReportShape(report, url);
    return report;
  }

  /**
   * @param {import('./types.js').Item[]} items
   * @param {Set<string>} seenSet
   * @returns {import('./types.js').Item[]}
   */
  filterNew(items, seenSet) {
    return filterNew(items, seenSet);
  }

  /**
   * @param {string} url
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<any>}
   */
  async #fetchJson(url, { signal } = {}) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeout);
    const combinedSignal = signal
      ? anySignal([signal, timeoutController.signal])
      : timeoutController.signal;

    let response;
    try {
      response = await this.fetch(url, { signal: combinedSignal });
    } catch (cause) {
      clearTimeout(timeoutId);
      throw new FeedFetchError(`Network error fetching ${url}`, { url, cause });
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new FeedFetchError(`HTTP ${response.status} fetching ${url}`, {
        url,
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new FeedMalformedError(`Response is not valid JSON`, {
        url,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  /**
   * @param {any} feed
   * @param {string} url
   */
  #assertFeedShape(feed, url) {
    if (typeof feed !== "object" || feed === null) {
      throw new FeedMalformedError("Feed is not an object", {
        url,
        reason: `got ${typeof feed}`,
      });
    }
    if (feed.version !== SUPPORTED_FEED_VERSION) {
      throw new FeedVersionMismatchError(feed.version);
    }
    if (!Array.isArray(feed.items)) {
      throw new FeedMalformedError("Feed is missing items array", {
        url,
        reason: "feed.items is not an array",
      });
    }
  }

  /**
   * @param {any} report
   * @param {string} url
   */
  #assertRunReportShape(report, url) {
    if (typeof report !== "object" || report === null) {
      throw new FeedMalformedError("Run report is not an object", {
        url,
        reason: `got ${typeof report}`,
      });
    }
    if (report.version !== SUPPORTED_FEED_VERSION) {
      throw new FeedVersionMismatchError(report.version);
    }
    if (!Array.isArray(report.sources)) {
      throw new FeedMalformedError("Run report is missing sources array", {
        url,
        reason: "report.sources is not an array",
      });
    }
    if (typeof report.summary !== "object" || report.summary === null) {
      throw new FeedMalformedError("Run report is missing summary", {
        url,
        reason: "report.summary is not an object",
      });
    }
  }
}

/**
 * Combines multiple AbortSignals into one that aborts when any of them do.
 *
 * Caveat — listener accumulation on long-lived signals:
 *   The `abort` listeners this function attaches to the input signals are
 *   released when the input signals themselves are garbage-collected. For
 *   short-lived user signals (or an absent user signal, the common case),
 *   this is a non-issue. For a pathological consumer that holds a single
 *   long-lived AbortSignal and fires thousands of concurrent fetches with
 *   it, listeners accumulate on that signal until it is either aborted or
 *   garbage-collected. Daily-cron consumers do not hit this shape.
 *
 * @param {AbortSignal[]} signals
 * @returns {AbortSignal}
 */
function anySignal(signals) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}
