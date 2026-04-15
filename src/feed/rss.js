import { XMLBuilder } from "fast-xml-parser";

export function generateRssFeed(items, meta = {}, existingItems = []) {
  const maxItems = meta.maxItems || 100;

  // Merge new items with existing, dedupe by id+source
  const seen = new Set();
  const merged = [];
  for (const item of [...items, ...existingItems]) {
    const key = `${item.id}|${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const sorted = merged
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    })
    .slice(0, maxItems);

  const title = meta.title || "anthropic-watch";
  const link = meta.link || "https://sefaertunc.github.io/anthropic-watch/";
  const description =
    meta.description || "Monitoring Anthropic sources for changes";

  const rssItems = sorted.map((item) => ({
    title: item.title,
    link: item.url,
    guid: { "#text": item.id, "@_isPermaLink": "false" },
    pubDate: item.date ? new Date(item.date).toUTCString() : "",
    category: item.source,
    description: item.snippet || "",
  }));

  const rssObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    rss: {
      "@_version": "2.0",
      channel: {
        title,
        link,
        description,
        generator: "anthropic-watch",
        ttl: 1440,
        lastBuildDate: new Date().toUTCString(),
        item: rssItems.length === 1 ? [rssItems[0]] : rssItems,
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    processEntities: true,
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(rssObj);
}
