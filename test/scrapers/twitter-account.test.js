import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  scrapeTwitterAccount,
  waitForSlot,
  _resetGateForTests,
  MIN_SPACING_MS,
} from "../../src/scrapers/twitter-account.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("twitter-account: waitForSlot spacing gate", () => {
  beforeEach(() => {
    _resetGateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should not block the first call (gate starts open)", async () => {
    const t0 = Date.now();
    await waitForSlot();
    expect(Date.now() - t0).toBe(0);
  });

  it("should block the second call for at least MIN_SPACING_MS", async () => {
    await waitForSlot();
    const t0 = Date.now();
    const p = waitForSlot();
    await vi.advanceTimersByTimeAsync(MIN_SPACING_MS);
    await p;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(MIN_SPACING_MS);
  });

  it("should chain correctly across three calls (not just pairwise)", async () => {
    await waitForSlot();
    const t0 = Date.now();
    const p2 = waitForSlot();
    const p3 = waitForSlot();
    await vi.advanceTimersByTimeAsync(MIN_SPACING_MS * 2);
    await Promise.all([p2, p3]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(MIN_SPACING_MS * 2);
  });
});

describe("scrapeTwitterAccount", () => {
  let tmpDir;
  let savedKey;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
    savedKey = process.env.TWITTERAPI_IO_KEY;
    _resetGateForTests();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env.TWITTERAPI_IO_KEY;
    else process.env.TWITTERAPI_IO_KEY = savedKey;
  });

  function makeSource(fixturePath, overrides = {}) {
    return {
      key: "twitter-anthropicai",
      name: "@AnthropicAI (official)",
      category: "community",
      scraperType: "twitter-account",
      username: "AnthropicAI",
      limit: 10,
      url: "https://x.com/AnthropicAI",
      fixtureFile: fixturePath,
      ...overrides,
    };
  }

  async function writeFixture(payload) {
    const fixturePath = join(tmpDir, "twitter.json");
    await writeFile(fixturePath, JSON.stringify(payload));
    return fixturePath;
  }

  it("should return [] without fetching when TWITTERAPI_IO_KEY is unset (Rule 4 graceful-skip carve-out)", async () => {
    delete process.env.TWITTERAPI_IO_KEY;
    // No fixtureFile — if the scraper ever reaches fetchSource, it would try
    // to hit the live API. Returning [] immediately is the contract.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const items = await scrapeTwitterAccount(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toEqual([]);
    const combined = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(combined).toContain("TWITTERAPI_IO_KEY not set");
    expect(combined).toContain("AnthropicAI");
    logSpy.mockRestore();
  });

  it("should return [] when TWITTERAPI_IO_KEY is empty string (same contract as unset)", async () => {
    process.env.TWITTERAPI_IO_KEY = "";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const items = await scrapeTwitterAccount(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toEqual([]);
    logSpy.mockRestore();
  });

  it("should parse tweets and emit source/sourceCategory/sourceName against real live-captured fixture", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const fixturePath = resolve(
      __dirname,
      "../fixtures/twitter-anthropicai.json",
    );
    const items = await scrapeTwitterAccount(makeSource(fixturePath));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(10);
    for (const item of items) {
      expect(item.source).toBe("twitter-anthropicai");
      expect(item.sourceCategory).toBe("community");
      expect(item.sourceName).toBe("@AnthropicAI (official)");
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(item.url).toMatch(/^https:\/\/(x|twitter)\.com\//);
      // Date converted from Twitter legacy format to ISO-8601.
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("should parse synthetic fixture with all required fields", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const fixturePath = await writeFixture({
      status: "success",
      code: 0,
      msg: "success",
      data: {
        pin_tweet: null,
        tweets: [
          {
            id: "1234567890",
            text: "Hello world from Twitter",
            url: "https://x.com/test/status/1234567890",
            createdAt: "Wed Apr 22 17:36:07 +0000 2026",
          },
          {
            id: "9876543210",
            text: "Another tweet",
            url: "https://x.com/test/status/9876543210",
            createdAt: "Tue Apr 21 10:00:00 +0000 2026",
          },
        ],
      },
    });

    const items = await scrapeTwitterAccount(makeSource(fixturePath));

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "1234567890",
        title: "Hello world from Twitter",
        url: "https://x.com/test/status/1234567890",
        source: "twitter-anthropicai",
        sourceCategory: "community",
        sourceName: "@AnthropicAI (official)",
      }),
    );
    // Date conversion: Twitter legacy → ISO-8601.
    expect(items[0].date).toBe("2026-04-22T17:36:07.000Z");
  });

  it("should coerce numeric tweet id to string (Twitter snowflake IDs exceed 2^53)", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const fixturePath = await writeFixture({
      data: {
        tweets: [
          {
            // Number literals like this lose precision in JSON.parse — but
            // we test the code path where the JSON-parsed id is coerced to
            // string via String() so consumers always see a string.
            id: "2047006548149289017",
            text: "x",
            url: "https://x.com/test/status/2047006548149289017",
            createdAt: "Wed Apr 22 17:36:07 +0000 2026",
          },
        ],
      },
    });
    const items = await scrapeTwitterAccount(makeSource(fixturePath));
    expect(items[0].id).toBe("2047006548149289017");
    expect(typeof items[0].id).toBe("string");
  });

  it("should respect source.limit when response has more tweets", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const manyTweets = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      text: `Tweet ${i}`,
      url: `https://x.com/test/status/${i}`,
      createdAt: "Wed Apr 22 17:36:07 +0000 2026",
    }));
    const fixturePath = await writeFixture({
      data: { tweets: manyTweets },
    });
    const items = await scrapeTwitterAccount(
      makeSource(fixturePath, { limit: 5 }),
    );
    expect(items).toHaveLength(5);
  });

  it("should return empty array when data.tweets is missing or empty", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const fixturePath = await writeFixture({
      status: "success",
      data: { pin_tweet: null, tweets: [] },
    });
    const items = await scrapeTwitterAccount(makeSource(fixturePath));
    expect(items).toEqual([]);
  });

  it("should null out snippet when text is empty", async () => {
    process.env.TWITTERAPI_IO_KEY = "test-key";
    const fixturePath = await writeFixture({
      data: {
        tweets: [
          {
            id: "1",
            text: "",
            url: "https://x.com/test/status/1",
            createdAt: "Wed Apr 22 17:36:07 +0000 2026",
          },
        ],
      },
    });
    const items = await scrapeTwitterAccount(makeSource(fixturePath));
    expect(items[0].snippet).toBeNull();
  });
});
