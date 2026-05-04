import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { fetchSource } from "../fetch-source.js";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf-8",
  ),
);

// Reddit's API guidance asks for a descriptive User-Agent identifying the app
// and contact, even on public RSS. Derived from package.json so point releases
// don't require manual edits.
const REDDIT_UA = `sefaertunc/anthropic-watch:v${pkg.version} (by /u/sefaertunc)`;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Reddit's <content type="html"> is double-escaped (`&lt;p&gt;...&lt;/p&gt;`
  // plus `&#32;` non-breaking-space markers) — a single entry's content can
  // exceed fast-xml-parser's default 1000-entities-per-document DoS guard.
  // Reddit is a trusted source; bump the cap rather than disable entity
  // decoding (which would leave the snippet HTML unparseable downstream).
  processEntities: { maxTotalExpansions: 100000 },
});

export async function scrapeRedditSubreddit(source) {
  const mode = source.mode;
  const limit = source.limit ?? 10;
  const timeWindow = source.timeWindow ?? "day";

  const url = `https://www.reddit.com/r/${source.subreddit}/${mode}.rss?t=${timeWindow}&limit=${limit}`;

  const res = await fetchSource(
    url,
    { headers: { "User-Agent": REDDIT_UA } },
    source.fixtureFile,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  if (!parsed?.feed) {
    throw new Error(`Reddit Atom parse: missing <feed> root for ${url}`);
  }

  const rawEntries = parsed.feed.entry;
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries
      ? [rawEntries]
      : [];

  return entries.map((entry) => {
    const link = Array.isArray(entry.link) ? entry.link[0] : entry.link;
    const rawContent = entry.content?.["#text"] ?? entry.content ?? "";
    return {
      id: String(entry.id),
      title: String(entry.title ?? ""),
      date: entry.published ?? null,
      url: link?.["@_href"] ?? null,
      snippet: extractSnippet(rawContent),
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    };
  });
}

function extractSnippet(html) {
  if (!html) return null;
  const $ = cheerio.load(html, null, false);
  const text = $("div.md").text().replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, 300);
}
