import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeBlogPage } from "../../src/scrapers/blog-page.js";

describe("scrapeBlogPage", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

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

  describe("nextjs-rsc mode (JSON payload)", () => {
    function makeSource(fixturePath) {
      return {
        key: "blog-engineering",
        name: "Anthropic Engineering Blog",
        category: "core",
        scraperType: "blog-page",
        parseMode: "nextjs-rsc",
        basePath: "/engineering",
        url: "https://www.anthropic.com/engineering",
        fixtureFile: fixturePath,
      };
    }

    it("parses RSC JSON payload", async () => {
      const html = `<!DOCTYPE html><html><body>
<script>self.__next_f=self.__next_f||[]</script>
<script>self.__next_f.push([1, "1:{\\\"slug\\\":\\\"test-post\\\",\\\"title\\\":\\\"Test Post\\\",\\\"publishedOn\\\":\\\"2026-01-15\\\",\\\"summary\\\":\\\"A test summary\\\"}\\n"])</script>
</body></html>`;
      const fixturePath = join(tmpDir, "blog.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage(makeSource(fixturePath));

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].title).toBe("Test Post");
      expect(items[0].id).toContain("test-post");
      expect(items[0].url).toContain("/engineering/test-post");
      expect(items[0].sourceCategory).toBe("core");
      expect(items[0].sourceName).toBe("Anthropic Engineering Blog");
    });

    it("has all required fields", async () => {
      const html = `<!DOCTYPE html><html><body>
<script>self.__next_f.push([1, "1:{\\\"slug\\\":\\\"post\\\",\\\"title\\\":\\\"Title\\\",\\\"publishedOn\\\":\\\"2026-01-01\\\",\\\"summary\\\":\\\"Summary\\\"}\\n"])</script>
</body></html>`;
      const fixturePath = join(tmpDir, "blog.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage(makeSource(fixturePath));
      for (const field of requiredFields) {
        expect(items[0]).toHaveProperty(field);
      }
    });

    it("falls back to HTML parsing when no RSC payload", async () => {
      const html = `<!DOCTYPE html><html><body>
<a href="/engineering/my-post"><h3>My Post Title</h3><time>Jan 1, 2026</time><p>Description</p></a>
</body></html>`;
      const fixturePath = join(tmpDir, "blog.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage(makeSource(fixturePath));
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].title).toBe("My Post Title");
    });
  });

  describe("webflow mode", () => {
    function makeSource(fixturePath) {
      return {
        key: "blog-claude",
        name: "Anthropic Claude Blog",
        category: "extended",
        scraperType: "blog-page",
        parseMode: "webflow",
        url: "https://claude.com/blog",
        fixtureFile: fixturePath,
      };
    }

    it("parses webflow blog items", async () => {
      const html = `<!DOCTYPE html><html><body>
<div class="w-dyn-item">
  <h3>Webflow Post</h3>
  <a href="/blog/test-post">Link</a>
  <div class="date">March 10, 2026</div>
  <p>A test description</p>
</div>
</body></html>`;
      const fixturePath = join(tmpDir, "blog.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage(makeSource(fixturePath));
      expect(items.length).toBe(1);
      expect(items[0].title).toBe("Webflow Post");
      expect(items[0].sourceCategory).toBe("extended");
    });
  });

  describe("distill mode", () => {
    function makeSource(fixturePath) {
      return {
        key: "blog-alignment",
        name: "Anthropic Alignment Blog",
        category: "extended",
        scraperType: "blog-page",
        parseMode: "distill",
        url: "https://alignment.anthropic.com",
        fixtureFile: fixturePath,
      };
    }

    it("parses distill .toc structure", async () => {
      const html = `<!DOCTYPE html><html><body>
<div class="toc">
  <div class="date">Jan 2026</div>
  <a class="note" href="/papers/test-paper"><h3>Test Paper</h3><div class="description">A great paper</div></a>
</div>
</body></html>`;
      const fixturePath = join(tmpDir, "blog.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage(makeSource(fixturePath));
      expect(items.length).toBe(1);
      expect(items[0].title).toBe("Test Paper");
      expect(items[0].snippet).toBe("A great paper");
    });
  });

  describe("error handling", () => {
    it("returns [] for empty HTML", async () => {
      const fixturePath = join(tmpDir, "empty.html");
      await writeFile(fixturePath, "<!DOCTYPE html><html><body></body></html>");

      const items = await scrapeBlogPage({
        key: "blog-engineering",
        name: "Test",
        category: "core",
        scraperType: "blog-page",
        parseMode: "nextjs-rsc",
        basePath: "/engineering",
        url: "https://www.anthropic.com/engineering",
        fixtureFile: fixturePath,
      });
      expect(items).toEqual([]);
    });

    it("returns [] for nonexistent fixture file", async () => {
      const items = await scrapeBlogPage({
        key: "blog-engineering",
        name: "Test",
        category: "core",
        scraperType: "blog-page",
        parseMode: "nextjs-rsc",
        basePath: "/engineering",
        url: "https://www.anthropic.com/engineering",
        fixtureFile: join(tmpDir, "nonexistent.html"),
      });
      expect(items).toEqual([]);
    });

    it("max 20 items", async () => {
      const posts = Array.from(
        { length: 25 },
        (_, i) =>
          `<script>self.__next_f.push([1, "${i}:{\\\"slug\\\":\\\"post-${i}\\\",\\\"title\\\":\\\"Post ${i}\\\",\\\"publishedOn\\\":\\\"2026-01-01\\\",\\\"summary\\\":\\\"s\\\"}\\n"])</script>`,
      ).join("\n");
      const html = `<!DOCTYPE html><html><body>${posts}</body></html>`;
      const fixturePath = join(tmpDir, "many.html");
      await writeFile(fixturePath, html);

      const items = await scrapeBlogPage({
        key: "blog-engineering",
        name: "Test",
        category: "core",
        scraperType: "blog-page",
        parseMode: "nextjs-rsc",
        basePath: "/engineering",
        url: "https://www.anthropic.com/engineering",
        fixtureFile: fixturePath,
      });
      expect(items.length).toBeLessThanOrEqual(20);
    });
  });
});
