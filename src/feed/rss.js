import { XMLBuilder } from "fast-xml-parser";

export function generateRssFeed(items, meta = {}) {
  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  const title = meta.title || "anthropic-watch";
  const link = meta.link || "https://your-username.github.io/anthropic-watch/";
  const description =
    meta.description || "Monitoring Anthropic sources for changes";

  const rssItems = sorted.map((item) => ({
    title: item.title,
    link: item.url,
    guid: { "#text": item.id, "@_isPermaLink": "false" },
    pubDate: new Date(item.date).toUTCString(),
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
