import { fetchSource } from "../fetch-source.js";
import * as log from "../log.js";

export async function scrapeHnAlgolia(source) {
  const tags = source.tags ?? "story";
  const limit = source.limit ?? 20;
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
    source.query,
  )}&tags=${tags}&hitsPerPage=${limit}`;

  const res = await fetchSource(url, {}, source.fixtureFile);

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const payload = await res.json();
  const hits = payload?.hits ?? [];

  // Algolia returns 200 with hits:[] for any query, including malformed ones.
  // Surface zero-hit cases so operators can spot a silently-broken query.
  if (hits.length === 0) {
    log.info(`hn-algolia: 0 hits for query "${source.query}"`);
  }

  return hits.map((hit) => ({
    id: hit.objectID,
    title: hit.title,
    date: hit.created_at,
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    snippet: hit.story_text ? hit.story_text.slice(0, 300) : null,
    source: source.key,
    sourceCategory: source.category,
    sourceName: source.name,
  }));
}
