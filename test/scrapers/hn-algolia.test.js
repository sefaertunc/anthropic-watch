import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeHnAlgolia } from "../../src/scrapers/hn-algolia.js";

describe("scrapeHnAlgolia", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath, overrides = {}) {
    return {
      key: "hn-anthropic-mentions",
      name: "Hacker News — anthropic.com / claude.ai / claude.com",
      category: "community",
      scraperType: "hn-algolia",
      query: "anthropic.com OR claude.ai OR claude.com",
      tags: "story",
      limit: 20,
      url: "https://hn.algolia.com/",
      fixtureFile: fixturePath,
      ...overrides,
    };
  }

  async function writeFixture(payload) {
    const fixturePath = join(tmpDir, "hn.json");
    await writeFile(fixturePath, JSON.stringify(payload));
    return fixturePath;
  }

  it("should parse hits and emit source/sourceCategory/sourceName", async () => {
    const fixturePath = await writeFixture({
      hits: [
        {
          objectID: "12345",
          title: "Show HN: something cool",
          created_at: "2026-04-01T00:00:00Z",
          url: "https://example.com/a",
          story_text: "Details",
        },
      ],
    });

    const items = await scrapeHnAlgolia(makeSource(fixturePath));

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "12345",
        title: "Show HN: something cool",
        date: "2026-04-01T00:00:00Z",
        url: "https://example.com/a",
        snippet: "Details",
        source: "hn-anthropic-mentions",
        sourceCategory: "community",
        sourceName: "Hacker News — anthropic.com / claude.ai / claude.com",
      }),
    );
  });

  it("should fall back to HN comment link when hit.url is null (Ask HN)", async () => {
    const fixturePath = await writeFixture({
      hits: [
        {
          objectID: "99999",
          title: "Ask HN: ...",
          created_at: "2026-04-01T00:00:00Z",
          url: null,
          story_text: null,
        },
      ],
    });

    const items = await scrapeHnAlgolia(makeSource(fixturePath));
    expect(items[0].url).toBe("https://news.ycombinator.com/item?id=99999");
    expect(items[0].snippet).toBeNull();
  });

  it("should log an info line when hits.length === 0 (observability for malformed query)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fixturePath = await writeFixture({ hits: [] });
    const items = await scrapeHnAlgolia(makeSource(fixturePath));
    expect(items).toEqual([]);
    expect(logSpy).toHaveBeenCalled();
    const combined = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(combined).toContain("hn-algolia: 0 hits");
    expect(combined).toContain("anthropic.com OR claude.ai");
    logSpy.mockRestore();
  });
});
