import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchSource } from "../fetch-source.js";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf-8",
  ),
);

// Reddit blocks generic User-Agents. The format below is what Reddit's public
// API guidance recommends; it derives from package.json version so point
// releases don't require manual edits.
const REDDIT_UA = `sefaertunc/anthropic-watch:v${pkg.version} (by /u/sefaertunc)`;

export async function scrapeRedditSubreddit(source) {
  const mode = source.mode;
  const limit = source.limit ?? 10;
  const timeWindow = source.timeWindow ?? "day";
  const minScore = source.minScore ?? 0;

  const url = `https://www.reddit.com/r/${source.subreddit}/${mode}.json?limit=${limit}&t=${timeWindow}`;
  const res = await fetchSource(
    url,
    { headers: { "User-Agent": REDDIT_UA } },
    source.fixtureFile,
  );

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const feed = await res.json();
  const children = feed?.data?.children ?? [];

  return (
    children
      .filter((c) => c.kind === "t3")
      .map((c) => c.data)
      .filter((post) => (post.score ?? 0) >= minScore)
      // Stickied posts recur daily in top mode; drop them. In new mode they're real content.
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
      }))
  );
}
