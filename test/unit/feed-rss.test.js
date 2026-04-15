import { describe, it, expect } from "vitest";
import { generateRssFeed } from "../../src/feed/rss.js";
import { validateRss } from "../helpers/rss-validator.js";

describe("generateRssFeed", () => {
  it("produces valid RSS 2.0", () => {
    const items = [
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "Test",
        url: "http://test",
        snippet: "desc",
      },
    ];
    const xml = generateRssFeed(items);
    const result = validateRss(xml);
    expect(result.valid).toBe(true);
    expect(result.itemCount).toBe(1);
  });

  it("contains ttl", () => {
    const xml = generateRssFeed([]);
    expect(xml).toContain("<ttl>");
  });

  it("handles empty items with valid RSS", () => {
    const xml = generateRssFeed([]);
    const result = validateRss(xml);
    expect(result.valid).toBe(true);
    expect(result.itemCount).toBe(0);
  });

  it("XML-escapes special chars in title", () => {
    const items = [
      {
        id: "1",
        source: "s",
        date: "2026-01-01T00:00:00Z",
        title: "A & B <test>",
        url: "http://test",
        snippet: "",
      },
    ];
    const xml = generateRssFeed(items);
    expect(xml).toContain("&amp;");
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
    const xml = generateRssFeed(items);
    const result = validateRss(xml);
    expect(result.itemCount).toBe(1);
  });

  it("accumulation merges correctly", () => {
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
    const xml = generateRssFeed(newItems, {}, existing);
    const result = validateRss(xml);
    expect(result.itemCount).toBe(2);
  });
});
