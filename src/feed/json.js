export function generateJsonFeed(items, meta = {}, existingItems = []) {
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
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, maxItems);

  return JSON.stringify(
    {
      version: "1.0",
      title: meta.title || "anthropic-watch",
      description:
        meta.description || "Monitoring Anthropic sources for changes",
      home_page_url: "https://sefaertunc.github.io/anthropic-watch/",
      generator: "anthropic-watch",
      ttl: 1440,
      generated: new Date().toISOString(),
      itemCount: sorted.length,
      items: sorted,
    },
    null,
    2,
  );
}
