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

  it("emits uniqueKey as `${id}|${source}` on every item", () => {
    const items = [
      {
        id: "v1.0.30",
        source: "claude-code-releases",
        date: "2026-01-01T00:00:00Z",
        title: "A",
        url: "http://a",
        snippet: "",
      },
      {
        id: "v1.1.0",
        source: "claude-code-releases",
        date: "2026-02-01T00:00:00Z",
        title: "B",
        url: "http://b",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(items));
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(typeof item.uniqueKey).toBe("string");
      expect(item.uniqueKey).toBe(`${item.id}|${item.source}`);
    }
  });

  describe("perSourceCap", () => {
    function makeItem(source, n) {
      return {
        id: `${source}-${n}`,
        source,
        date: `2026-05-${String(n).padStart(2, "0")}T00:00:00Z`,
        title: `${source} ${n}`,
        url: `http://${source}/${n}`,
        snippet: "",
      };
    }

    it("caps each source at perSourceCap items in the aggregate", () => {
      // 3 sources × 10 items each. Without a cap, the newest source would
      // dominate. With perSourceCap: 2, each source contributes its 2
      // newest items — 6 items total before global truncation.
      const items = [];
      for (const source of ["a", "b", "c"]) {
        for (let n = 1; n <= 10; n++) items.push(makeItem(source, n));
      }
      const result = JSON.parse(generateJsonFeed(items, { perSourceCap: 2 }));
      const counts = {};
      for (const it of result.items)
        counts[it.source] = (counts[it.source] || 0) + 1;
      expect(counts).toEqual({ a: 2, b: 2, c: 2 });
      // Each source's surviving items are its newest two (n=9 and n=10).
      for (const source of ["a", "b", "c"]) {
        const ids = result.items
          .filter((it) => it.source === source)
          .map((it) => it.id)
          .sort();
        expect(ids).toEqual([`${source}-10`, `${source}-9`]);
      }
    });

    it("does not cap when perSourceCap is unset (per-source feed call shape)", () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        makeItem("only", i + 1),
      );
      const result = JSON.parse(generateJsonFeed(items, { maxItems: 50 }));
      expect(result.itemCount).toBe(8);
    });

    it("applies maxItems after the per-source cap", () => {
      // 30 sources × 5 items = 150 considered → cap of 5 leaves 150 → trim to 100.
      const items = [];
      for (let s = 0; s < 30; s++) {
        for (let n = 1; n <= 5; n++) items.push(makeItem(`s${s}`, n));
      }
      const result = JSON.parse(
        generateJsonFeed(items, { perSourceCap: 5, maxItems: 100 }),
      );
      expect(result.itemCount).toBe(100);
      // No single source exceeds the cap.
      const counts = {};
      for (const it of result.items)
        counts[it.source] = (counts[it.source] || 0) + 1;
      for (const count of Object.values(counts)) {
        expect(count).toBeLessThanOrEqual(5);
      }
    });

    it("preserves dedupe + uniqueKey when capping (no duplicates inside a source)", () => {
      const items = [
        makeItem("a", 1),
        makeItem("a", 1), // exact duplicate
        makeItem("a", 2),
      ];
      const result = JSON.parse(generateJsonFeed(items, { perSourceCap: 5 }));
      expect(result.itemCount).toBe(2);
      const keys = result.items.map((it) => it.uniqueKey);
      expect(new Set(keys).size).toBe(2);
    });
  });

  it("same id across different sources yields distinct uniqueKey values", () => {
    const items = [
      {
        id: "2.1.114",
        source: "claude-code-changelog",
        date: "2026-01-01T00:00:00Z",
        title: "Changelog entry",
        url: "http://a",
        snippet: "",
      },
      {
        id: "2.1.114",
        source: "npm-claude-code",
        date: "2026-01-01T00:00:00Z",
        title: "npm release",
        url: "http://b",
        snippet: "",
      },
    ];
    const result = JSON.parse(generateJsonFeed(items));
    expect(result.itemCount).toBe(2);
    const keys = result.items.map((i) => i.uniqueKey);
    expect(keys).toContain("2.1.114|claude-code-changelog");
    expect(keys).toContain("2.1.114|npm-claude-code");
    expect(new Set(keys).size).toBe(2);
  });
});
