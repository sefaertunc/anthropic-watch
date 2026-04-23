import { describe, it, expect } from "vitest";
import { generateJsonFeed } from "../../src/feed/json.js";
import { generateRssFeed } from "../../src/feed/rss.js";

describe("feed generators — community category pass-through", () => {
  const communityItem = {
    id: "abc123",
    title: "A community post",
    date: "2026-04-23T00:00:00Z",
    url: "https://example.com/a",
    snippet: "Snippet",
    source: "reddit-claudecode",
    sourceCategory: "community",
    sourceName: "r/ClaudeCode (top/day)",
  };

  it("should preserve sourceCategory='community' in the JSON feed item", () => {
    const json = JSON.parse(generateJsonFeed([communityItem]));
    expect(json.items).toHaveLength(1);
    expect(json.items[0].sourceCategory).toBe("community");
    expect(json.items[0].source).toBe("reddit-claudecode");
    expect(json.items[0].uniqueKey).toBe("abc123|reddit-claudecode");
  });

  it("should mix community alongside core/extended items without dropping any", () => {
    const items = [
      communityItem,
      {
        ...communityItem,
        id: "core-1",
        source: "blog-engineering",
        sourceCategory: "core",
        uniqueKey: undefined,
      },
      {
        ...communityItem,
        id: "ext-1",
        source: "blog-claude",
        sourceCategory: "extended",
        uniqueKey: undefined,
      },
    ];
    const json = JSON.parse(generateJsonFeed(items));
    const categories = json.items.map((i) => i.sourceCategory).sort();
    expect(categories).toEqual(["community", "core", "extended"]);
  });

  it("should emit community items in the RSS feed without special-casing", () => {
    const rss = generateRssFeed([communityItem], {
      title: "test",
      link: "https://example.com/",
      description: "test",
    });
    expect(rss).toContain("A community post");
    // Whatever field holds source identity, the community item surfaces.
    expect(rss).toContain("reddit-claudecode");
  });
});
