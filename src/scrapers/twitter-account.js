import { fetchSource } from "../fetch-source.js";
import { parseFlexibleDate } from "../parse-date.js";
import * as log from "../log.js";

// twitterapi.io free tier is documented at 1 req / 5 s. Under the orchestrator's
// runWithConcurrency(4) the Twitter lane reliably blew through that limit in
// v1.4.0 — 5–6 of 8 handles returned 429 per scheduled run. v1.4.1 paces
// Twitter calls to 1 req / 6 s via a module-scope chained-Promise gate. 20%
// safety margin over the advertised limit. See CHANGELOG [1.4.1].
export const MIN_SPACING_MS = 6000;

let lastCallAt = 0;
let gate = Promise.resolve();

export function waitForSlot() {
  gate = gate.then(async () => {
    const elapsed = Date.now() - lastCallAt;
    const wait = Math.max(0, MIN_SPACING_MS - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  return gate;
}

// Internal — reset gate state between tests. Underscore prefix marks
// private API.
export function _resetGateForTests() {
  lastCallAt = 0;
  gate = Promise.resolve();
}

// Graceful-skip contract: if TWITTERAPI_IO_KEY is unset or empty, return []
// without attempting any fetch. This is the ONE narrowly-scoped carve-out to
// the Rule 4 "scrapers throw on errors" contract. Missing key is not an error
// — it's an explicit feature so forks and local dev sessions can run the
// scraper without configuring a paid credential.
//
// Every other failure mode (401, 403, 429, 5xx, network, parse) throws.
export async function scrapeTwitterAccount(source) {
  const key = process.env.TWITTERAPI_IO_KEY;
  if (!key) {
    log.info(
      `twitter-account: TWITTERAPI_IO_KEY not set; returning 0 items for ${source.username}`,
    );
    return [];
  }

  await waitForSlot();

  const limit = source.limit ?? 10;
  const url = `https://api.twitterapi.io/twitter/user/last_tweets?userName=${encodeURIComponent(
    source.username,
  )}&includeReplies=false`;
  const res = await fetchSource(
    url,
    { headers: { "X-API-Key": key } },
    source.fixtureFile,
  );

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const payload = await res.json();
  const tweets = (payload?.data?.tweets ?? []).slice(0, limit);

  // Twitter returns legacy format like "Wed Apr 22 17:36:07 +0000 2026";
  // parseFlexibleDate handles NaN-guarding and ISO conversion.
  return tweets.map((tweet) => ({
    id: String(tweet.id),
    title: (tweet.text ?? "").slice(0, 200),
    date: parseFlexibleDate(tweet.createdAt),
    url: tweet.url,
    snippet: tweet.text ? tweet.text.slice(0, 300) : null,
    source: source.key,
    sourceCategory: source.category,
    sourceName: source.name,
  }));
}
