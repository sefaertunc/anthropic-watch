import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scrapeRedditSubreddit } from "../../src/scrapers/reddit-subreddit.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));

const requiredFields = [
  "id",
  "title",
  "date",
  "url",
  "snippet",
  "source",
  "sourceCategory",
  "sourceName",
];

function makeSource(overrides = {}) {
  return {
    key: "reddit-claudecode",
    name: "r/ClaudeCode (top/day)",
    url: "https://www.reddit.com/r/ClaudeCode/",
    category: "community",
    scraperType: "reddit-subreddit",
    subreddit: "ClaudeCode",
    mode: "top",
    timeWindow: "day",
    limit: 15,
    ...overrides,
  };
}

describe("scrapeRedditSubreddit", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-reddit-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("parses a happy-path Atom feed and emits the 8-field item shape", async () => {
    const items = await scrapeRedditSubreddit(
      makeSource({
        fixtureFile: join(FIXTURE_DIR, "reddit-claudecode-top.atom.xml"),
      }),
    );

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const field of requiredFields) {
        expect(item).toHaveProperty(field);
      }
      expect(item.source).toBe("reddit-claudecode");
      expect(item.sourceCategory).toBe("community");
      expect(item.sourceName).toBe("r/ClaudeCode (top/day)");
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.url).toBe("string");
    }
  });

  it("returns [] when the feed has no <entry> elements", async () => {
    const items = await scrapeRedditSubreddit(
      makeSource({
        key: "reddit-claudeopus",
        subreddit: "Claudeopus",
        fixtureFile: join(FIXTURE_DIR, "reddit-claudeopus-top-day.atom.xml"),
      }),
    );
    expect(items).toEqual([]);
  });

  it("uses <entry><id> directly as the item id (t3_<base36> format)", async () => {
    const items = await scrapeRedditSubreddit(
      makeSource({
        fixtureFile: join(FIXTURE_DIR, "reddit-claudecode-top.atom.xml"),
      }),
    );
    for (const item of items) {
      expect(item.id).toMatch(/^t3_[a-z0-9]+$/);
    }
  });

  it("uses <published> not <updated> for the date field", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_abc123</id>
    <title>Test</title>
    <link href="https://reddit.com/r/test/comments/abc123/test/"/>
    <updated>2026-05-01T00:00:00+00:00</updated>
    <published>2026-04-15T12:34:56+00:00</published>
    <content type="html"></content>
  </entry>
</feed>`;
    const fixturePath = join(tmpDir, "feed.xml");
    await writeFile(fixturePath, xml);

    const items = await scrapeRedditSubreddit(
      makeSource({ fixtureFile: fixturePath }),
    );
    expect(items[0].date).toBe("2026-04-15T12:34:56+00:00");
  });

  it("strips HTML and the [link]/[comments] footer from snippet, truncating to 300 chars", async () => {
    const items = await scrapeRedditSubreddit(
      makeSource({
        fixtureFile: join(FIXTURE_DIR, "reddit-claudecode-top.atom.xml"),
      }),
    );
    const withSnippet = items.find((i) => i.snippet);
    expect(withSnippet).toBeDefined();
    expect(withSnippet.snippet).not.toMatch(/<[a-z]/i);
    expect(withSnippet.snippet).not.toContain("[link]");
    expect(withSnippet.snippet).not.toContain("[comments]");
    expect(withSnippet.snippet).not.toContain("submitted by");
    expect(withSnippet.snippet.length).toBeLessThanOrEqual(300);
  });

  it("returns null snippet for link posts with no selftext", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_linkpost</id>
    <title>External link</title>
    <link href="https://reddit.com/r/test/comments/linkpost/external/"/>
    <published>2026-05-01T00:00:00+00:00</published>
    <content type="html">&lt;span&gt;&lt;a href="https://reddit.com/x"&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;span&gt;&lt;a href="https://reddit.com/y"&gt;[comments]&lt;/a&gt;&lt;/span&gt;</content>
  </entry>
</feed>`;
    const fixturePath = join(tmpDir, "linkpost.xml");
    await writeFile(fixturePath, xml);

    const items = await scrapeRedditSubreddit(
      makeSource({ fixtureFile: fixturePath }),
    );
    expect(items[0].snippet).toBeNull();
  });

  it("throws on HTTP 4xx/5xx (Rule 4 compliance)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => "",
    });
    await expect(scrapeRedditSubreddit(makeSource())).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("throws when the response body is not a Reddit Atom feed", async () => {
    const fixturePath = join(tmpDir, "garbage.xml");
    await writeFile(fixturePath, "not an atom feed");

    await expect(
      scrapeRedditSubreddit(makeSource({ fixtureFile: fixturePath })),
    ).rejects.toThrow(/missing <feed> root/);
  });

  it("normalizes <entry> for both single-entry and multi-entry feeds", async () => {
    const single = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_only</id>
    <title>Only one</title>
    <link href="https://reddit.com/r/test/comments/only/x/"/>
    <published>2026-05-01T00:00:00+00:00</published>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Body&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`;
    const singlePath = join(tmpDir, "single.xml");
    await writeFile(singlePath, single);
    const singleItems = await scrapeRedditSubreddit(
      makeSource({ fixtureFile: singlePath }),
    );
    expect(singleItems).toHaveLength(1);
    expect(singleItems[0].id).toBe("t3_only");

    const multi = await scrapeRedditSubreddit(
      makeSource({
        fixtureFile: join(FIXTURE_DIR, "reddit-claudecode-top.atom.xml"),
      }),
    );
    expect(multi.length).toBeGreaterThan(1);
  });
});
