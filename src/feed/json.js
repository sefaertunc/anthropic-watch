export function generateJsonFeed(items, meta = {}, existingItems = []) {
  const maxItems = meta.maxItems || 100;
  const perSourceCap = meta.perSourceCap;

  // Merge new items with existing, dedupe by id+source, and stamp the
  // composite key on each merged item as `uniqueKey` (added in v1.2.0).
  const seen = new Set();
  const merged = [];
  for (const item of [...items, ...existingItems]) {
    const key = `${item.id}|${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...item, uniqueKey: key });
  }

  const byDateDesc = (a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  };

  // Per-source cap (v1.6.0+): when set, each source contributes at most N
  // of its newest items to the aggregate. Prevents high-cadence community
  // sources from filling the global window and pushing low-cadence core
  // sources off the aggregate. Per-source feeds omit this so retention is
  // unaffected for `feeds/{key}.json`.
  let capped = merged;
  if (perSourceCap) {
    const bySource = new Map();
    for (const item of merged) {
      const arr = bySource.get(item.source) ?? [];
      arr.push(item);
      bySource.set(item.source, arr);
    }
    capped = [];
    for (const arr of bySource.values()) {
      arr.sort(byDateDesc);
      capped.push(...arr.slice(0, perSourceCap));
    }
  }

  const sorted = capped.sort(byDateDesc).slice(0, maxItems);

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
