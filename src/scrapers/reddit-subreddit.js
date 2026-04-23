import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchSource } from "../fetch-source.js";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf-8",
  ),
);

// Reddit blocks generic User-Agents AND unauthenticated datacenter-IP traffic
// (GitHub Actions). v1.4.1 added OAuth2 script-app authentication against
// oauth.reddit.com — the sanctioned programmatic path. The UA format below is
// still required (Reddit's API guidance); it derives from package.json so
// point releases don't require manual edits.
const REDDIT_UA = `sefaertunc/anthropic-watch:v${pkg.version} (by /u/sefaertunc)`;

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

// Module-scope memoized token promise. One token fetch per pipeline run,
// shared across all reddit-* sources. Reset on 401 (upstream token revoked or
// expired mid-run); never persisted to state/last-seen.json per Rule 8 and
// secret-hygiene policy.
let tokenPromise = null;

// Internal — reset memoized state between tests. Underscore prefix marks
// private API.
export function _resetTokenForTests() {
  tokenPromise = null;
}

async function getRedditToken(clientId, clientSecret, source) {
  // Fixture short-circuit: tests that set source.fixtureFile must never hit
  // the real OAuth endpoint. Returning a fake token here is safe because the
  // matching fetchSource call will also short-circuit to the fixture.
  if (source?.fixtureFile) return "test-token";

  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_UA,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      throw new Error(`Reddit OAuth token fetch failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.access_token) {
      throw new Error("Reddit OAuth response missing access_token");
    }
    return json.access_token;
  })();

  try {
    return await tokenPromise;
  } catch (err) {
    tokenPromise = null;
    throw err;
  }
}

export async function scrapeRedditSubreddit(source) {
  // Graceful-skip when credentials absent — mirrors the v1.4.0
  // TWITTERAPI_IO_KEY pattern. Forks and local dev without OAuth creds still
  // run cleanly; reddit-* sources just emit 0 items.
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const mode = source.mode;
  const limit = source.limit ?? 10;
  const timeWindow = source.timeWindow ?? "day";
  const minScore = source.minScore ?? 0;

  const url = `https://oauth.reddit.com/r/${source.subreddit}/${mode}.json?limit=${limit}&t=${timeWindow}`;

  const makeRequest = async () => {
    const token = await getRedditToken(clientId, clientSecret, source);
    return fetchSource(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": REDDIT_UA,
        },
      },
      source.fixtureFile,
    );
  };

  let res = await makeRequest();
  // One-shot 401 recovery: upstream may revoke a memoized token before it
  // actually expires, or the scraper's process may outlive a real token TTL
  // (local dev). Invalidate, refresh once, retry exactly once.
  if (res.status === 401) {
    tokenPromise = null;
    res = await makeRequest();
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const feed = await res.json();
  const children = feed?.data?.children ?? [];

  return children
    .filter((c) => c.kind === "t3")
    .map((c) => c.data)
    .filter((post) => (post.score ?? 0) >= minScore)
    .filter((post) => !(mode === "top" && post.stickied))
    .map((post) => ({
      id: post.name,
      title: post.title,
      date: post.created_utc
        ? new Date(post.created_utc * 1000).toISOString()
        : null,
      url: `https://reddit.com${post.permalink}`,
      snippet: post.selftext ? post.selftext.slice(0, 300) : null,
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    }));
}
