import { fetchSource } from "../fetch-source.js";
import { parseFlexibleDate } from "../parse-date.js";
import * as log from "../log.js";

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
