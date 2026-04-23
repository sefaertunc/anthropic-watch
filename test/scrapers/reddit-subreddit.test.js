import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeRedditSubreddit } from "../../src/scrapers/reddit-subreddit.js";

describe("scrapeRedditSubreddit", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath, overrides = {}) {
    return {
      key: "reddit-claudecode",
      name: "r/ClaudeCode (top/day)",
      category: "community",
      scraperType: "reddit-subreddit",
      subreddit: "ClaudeCode",
      mode: "top",
      timeWindow: "day",
      limit: 15,
      minScore: 0,
      url: "https://www.reddit.com/r/ClaudeCode/",
      fixtureFile: fixturePath,
      ...overrides,
    };
  }

  function redditPost(overrides = {}) {
    return {
      kind: "t3",
      data: {
        name: "t3_abc123",
        title: "Hello from Reddit",
        created_utc: 1714636800, // 2024-05-02T08:00:00Z
        permalink: "/r/ClaudeCode/comments/abc123/hello/",
        selftext: "Body text",
        score: 42,
        stickied: false,
        ...overrides,
      },
    };
  }

  async function writeFixture(payload) {
    const fixturePath = join(tmpDir, "reddit.json");
    await writeFile(fixturePath, JSON.stringify(payload));
    return fixturePath;
  }

  it("should parse posts and emit source/sourceCategory/sourceName", async () => {
    const fixturePath = await writeFixture({
      data: {
        children: [
          redditPost(),
          redditPost({
            name: "t3_xyz789",
            title: "Another",
            created_utc: 1714723200,
            permalink: "/r/ClaudeCode/comments/xyz789/another/",
            score: 10,
          }),
        ],
      },
    });

    const items = await scrapeRedditSubreddit(makeSource(fixturePath));

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "t3_abc123",
        title: "Hello from Reddit",
        url: "https://reddit.com/r/ClaudeCode/comments/abc123/hello/",
        snippet: "Body text",
        source: "reddit-claudecode",
        sourceCategory: "community",
        sourceName: "r/ClaudeCode (top/day)",
      }),
    );
    expect(items[0].date).toBe("2024-05-02T08:00:00.000Z");
  });

  it("should drop posts with score below minScore", async () => {
    const fixturePath = await writeFixture({
      data: {
        children: [
          redditPost({ score: 5 }),
          redditPost({ name: "t3_keep", score: 100 }),
        ],
      },
    });

    const items = await scrapeRedditSubreddit(
      makeSource(fixturePath, { minScore: 50 }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("t3_keep");
  });

  it("should drop stickied posts in top mode", async () => {
    const fixturePath = await writeFixture({
      data: {
        children: [
          redditPost({ stickied: true }),
          redditPost({ name: "t3_keep" }),
        ],
      },
    });

    const items = await scrapeRedditSubreddit(
      makeSource(fixturePath, { mode: "top" }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("t3_keep");
  });

  it("should keep stickied posts in new mode", async () => {
    const fixturePath = await writeFixture({
      data: {
        children: [
          redditPost({ stickied: true, name: "t3_sticky" }),
          redditPost({ name: "t3_regular" }),
        ],
      },
    });

    const items = await scrapeRedditSubreddit(
      makeSource(fixturePath, { mode: "new" }),
    );
    expect(items).toHaveLength(2);
  });

  it("should filter non-t3 children defensively", async () => {
    const fixturePath = await writeFixture({
      data: {
        children: [{ kind: "t1", data: { name: "t1_comment" } }, redditPost()],
      },
    });

    const items = await scrapeRedditSubreddit(makeSource(fixturePath));
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("t3_abc123");
  });

  it("should return empty array when children is empty", async () => {
    const fixturePath = await writeFixture({ data: { children: [] } });
    const items = await scrapeRedditSubreddit(makeSource(fixturePath));
    expect(items).toEqual([]);
  });

  it("should null out snippet when selftext is empty", async () => {
    const fixturePath = await writeFixture({
      data: { children: [redditPost({ selftext: "" })] },
    });
    const items = await scrapeRedditSubreddit(makeSource(fixturePath));
    expect(items[0].snippet).toBeNull();
  });
});
