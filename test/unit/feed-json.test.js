import { describe, it, expect } from "vitest";
import { generateJsonFeed } from "../../src/feed/json.js";

describe("generateJsonFeed", () => {
  it("produces valid JSON with all top-level fields", () => {
    const result = JSON.parse(generateJsonFeed([], {}));
    expect(result.version).toBe("1.0");
    expect(result.title).toBe("anthropic-watch");
    expect(result.generator).toBe("anthropic-watch");
    expect(result.ttl).toBe(1440);
    expect(result.generated).toBeTruthy();
    expect(result.items).toEqual([]);
    expect(result.itemCount).toBe(0);
  });

  it("itemCount matches items.length", () => {
    const items = [
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "A",
        url: "http://a",
        snippet: "",
      },
      {
        id: "2",
        source: "s",
        date: "2026-01-02T00:00:00Z",
        title: "B",
        url: "http://b",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(items));
    expect(result.itemCount).toBe(2);
    expect(result.items.length).toBe(2);
  });

  it("sorts by date descending, null dates last", () => {
    const items = [
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "Old",
        url: "http://a",
        snippet: "",
      },
      {
        id: "2",
        source: "s",
        date: null,
        title: "Null",
        url: "http://c",
        snippet: "",
      },
      {
        id: "3",
        source: "s",
        date: "2026-06-01T00:00:00Z",
        title: "New",
        url: "http://b",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(items));
    expect(result.items[0].title).toBe("New");
    expect(result.items[1].title).toBe("Old");
    expect(result.items[2].title).toBe("Null");
  });

  it("empty items produces valid feed with itemCount 0", () => {
    const result = JSON.parse(generateJsonFeed([]));
    expect(result.itemCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("deduplicates by id+source", () => {
    const items = [
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "A",
        url: "http://a",
        snippet: "",
      },
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "A dup",
        url: "http://a",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(items));
    expect(result.itemCount).toBe(1);
  });

  it("respects maxItems", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      source: "s",
      date: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      title: `Item ${i}`,
      url: `http://item${i}`,
      snippet: "",
    }));
    const result = JSON.parse(generateJsonFeed(items, { maxItems: 3 }));
    expect(result.itemCount).toBe(3);
  });

  it("accumulation merges new and existing items correctly", () => {
    const existing = [
      {
        id: "old",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "Old",
        url: "http://old",
        snippet: "",
      },
    ];
    const newItems = [
      {
        id: "new",
        source: "s",
        date: "2026-06-01T00:00:00Z",
        title: "New",
        url: "http://new",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(newItems, {}, existing));
    expect(result.itemCount).toBe(2);
    expect(result.items[0].id).toBe("new");
    expect(result.items[1].id).toBe("old");
  });
});
