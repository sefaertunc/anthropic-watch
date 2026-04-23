import { describe, it, expect } from "vitest";
import { uniqueKey, filterNew, dedupe } from "../src/client.js";

describe("uniqueKey", () => {
  it("returns pre-computed value when present", () => {
    const item = {
      id: "a",
      source: "src1",
      uniqueKey: "PRECOMPUTED",
    };
    expect(uniqueKey(item)).toBe("PRECOMPUTED");
  });

  it("falls back to `${id}|${source}` when uniqueKey is absent", () => {
    const item = { id: "1.2.3", source: "claude-code-changelog" };
    expect(uniqueKey(item)).toBe("1.2.3|claude-code-changelog");
  });

  it("treats an empty-string uniqueKey as intentional and returns it", () => {
    // Using `??` (not `||`) means empty string is preserved. If a consumer has
    // explicitly chosen an empty key for some item, honor it rather than silently
    // falling back — the ?? semantics are deliberate.
    const item = { id: "x", source: "y", uniqueKey: "" };
    expect(uniqueKey(item)).toBe("");
  });
});

describe("filterNew", () => {
  it("removes items whose uniqueKey is already in the seenSet", () => {
    const items = [
      { id: "1", source: "a", uniqueKey: "1|a" },
      { id: "2", source: "a", uniqueKey: "2|a" },
    ];
    const seen = new Set(["1|a"]);
    const fresh = filterNew(items, seen);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe("2");
  });

  it("keeps all items when seenSet is empty", () => {
    const items = [
      { id: "1", source: "a", uniqueKey: "1|a" },
      { id: "2", source: "a", uniqueKey: "2|a" },
    ];
    expect(filterNew(items, new Set())).toHaveLength(2);
  });

  it("returns empty array when given empty input", () => {
    expect(filterNew([], new Set())).toEqual([]);
  });

  it("throws TypeError when passed an array instead of a Set", () => {
    expect(() => filterNew([], [])).toThrow(TypeError);
    expect(() => filterNew([], ["a"])).toThrow(/must be a Set/);
  });

  it("uses the fallback when items have no uniqueKey field", () => {
    const items = [{ id: "1", source: "a" }];
    const seen = new Set(["1|a"]);
    expect(filterNew(items, seen)).toEqual([]);
  });
});

describe("dedupe", () => {
  it("preserves first occurrence of each uniqueKey", () => {
    const items = [
      { id: "1", source: "a", uniqueKey: "1|a", title: "first" },
      { id: "1", source: "a", uniqueKey: "1|a", title: "duplicate" },
      { id: "2", source: "a", uniqueKey: "2|a", title: "other" },
    ];
    const out = dedupe(items);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("first");
    expect(out[1].title).toBe("other");
  });

  it("handles items without uniqueKey via the fallback", () => {
    const items = [
      { id: "1", source: "a" },
      { id: "1", source: "a" },
      { id: "1", source: "b" },
    ];
    const out = dedupe(items);
    expect(out).toHaveLength(2);
  });

  it("preserves input order for kept items (stable)", () => {
    const items = [
      { id: "3", source: "a", uniqueKey: "3|a" },
      { id: "1", source: "a", uniqueKey: "1|a" },
      { id: "2", source: "a", uniqueKey: "2|a" },
    ];
    const out = dedupe(items);
    expect(out.map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  it("returns empty array on empty input", () => {
    expect(dedupe([])).toEqual([]);
  });
});
