import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scrapeRedditSubreddit,
  _resetTokenForTests,
} from "../../src/scrapers/reddit-subreddit.js";

describe("scrapeRedditSubreddit", () => {
  let tmpDir;
  let savedId;
  let savedSecret;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
    savedId = process.env.REDDIT_CLIENT_ID;
    savedSecret = process.env.REDDIT_CLIENT_SECRET;
    process.env.REDDIT_CLIENT_ID = "test-id";
    process.env.REDDIT_CLIENT_SECRET = "test-secret";
    _resetTokenForTests();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (savedId === undefined) delete process.env.REDDIT_CLIENT_ID;
    else process.env.REDDIT_CLIENT_ID = savedId;
    if (savedSecret === undefined) delete process.env.REDDIT_CLIENT_SECRET;
    else process.env.REDDIT_CLIENT_SECRET = savedSecret;
    vi.restoreAllMocks();
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

  it("should return [] without fetching when REDDIT_CLIENT_ID is unset (Rule 4 graceful-skip carve-out)", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const items = await scrapeRedditSubreddit(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should return [] without fetching when REDDIT_CLIENT_SECRET is unset", async () => {
    delete process.env.REDDIT_CLIENT_SECRET;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const items = await scrapeRedditSubreddit(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should return [] when REDDIT_CLIENT_ID is empty string (same contract as unset)", async () => {
    process.env.REDDIT_CLIENT_ID = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const items = await scrapeRedditSubreddit(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

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

  it("should never hit the real OAuth token endpoint when fixtureFile is set", async () => {
    const fixturePath = await writeFixture({
      data: { children: [redditPost()] },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await scrapeRedditSubreddit(makeSource(fixturePath));
    // fetchSource short-circuits on fixtureFile, getRedditToken short-circuits
    // on fixtureFile — no real network call should happen at all.
    const oauthCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes("/api/v1/access_token"),
    );
    expect(oauthCalls).toHaveLength(0);
  });

  it("should throw when OAuth token fetch fails (Rule 4 compliance)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    // No fixtureFile → the token fetch runs for real (but mocked).
    await expect(
      scrapeRedditSubreddit(makeSource(null, { fixtureFile: null })),
    ).rejects.toThrow(/Reddit OAuth token fetch failed/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.reddit.com/api/v1/access_token",
    );
  });

  it("should retry once with a fresh token on 401 from data endpoint (M3 recovery path)", async () => {
    const listingPayload = {
      data: {
        children: [
          redditPost({ name: "t3_retry", title: "Fetched after refresh" }),
        ],
      },
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "t1", expires_in: 86400 }),
          { status: 200 },
        ),
      ) // initial token fetch
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // data call #1 — stale token
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "t2", expires_in: 86400 }),
          { status: 200 },
        ),
      ) // token refresh
      .mockResolvedValueOnce(
        new Response(JSON.stringify(listingPayload), { status: 200 }),
      ); // data call #2 — succeeds

    const items = await scrapeRedditSubreddit(
      makeSource(null, { fixtureFile: null }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("t3_retry");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    // Second data call must use the NEW token (t2), not the stale one (t1).
    const secondDataCall = fetchSpy.mock.calls[3];
    const authHeader = secondDataCall[1]?.headers?.Authorization;
    expect(authHeader).toBe("Bearer t2");
  });

  it("should throw when second attempt also 401s (bounded retry)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "t1", expires_in: 86400 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "t2", expires_in: 86400 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // still 401 on retry
    await expect(
      scrapeRedditSubreddit(makeSource(null, { fixtureFile: null })),
    ).rejects.toThrow(/HTTP 401/);
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
