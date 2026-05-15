// Module constants and pure helpers. No side effects, no class state.
// Kept separate from client.js so that consumers pulling only the helpers
// (e.g. post-fetch dedup in a non-HTTP context) don't drag in the class.

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
 * Computes the cron-freshness state at read time. A stale envelope cannot
 * self-report staleness (the cron didn't run, so neither did the writer), so
 * this arithmetic must happen on the consumer side. Mirrors the canonical
 * example in docs/FEED-SCHEMA.md § "Read-time cron-freshness computation".
 *
 * @param {{ feedHealth: import('./types.js').FeedHealth, now?: number }} options
 * @returns {'ok' | 'warning' | 'fired'}
 */
export function computeCronFreshnessState({
  feedHealth,
  now = Date.now(),
} = {}) {
  const ageHours = (now - new Date(feedHealth.generatedAt).getTime()) / 3600000;
  const t = feedHealth.indicators.cronFreshness.thresholdHours;
  return ageHours > t.fired ? "fired" : ageHours > t.warning ? "warning" : "ok";
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
