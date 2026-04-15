export function generateJsonFeed(items, meta = {}) {
  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

  return JSON.stringify(
    {
      version: "1.0",
      title: meta.title || "anthropic-watch",
      description:
        meta.description || "Monitoring Anthropic sources for changes",
      generated: new Date().toISOString(),
      itemCount: sorted.length,
      items: sorted,
    },
    null,
    2,
  );
}
