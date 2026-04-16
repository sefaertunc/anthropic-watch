import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scrapeDocsPage } from "../../src/scrapers/docs-page.js";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));

describe("scrapeDocsPage", () => {
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

  describe("docs-hash mode", () => {
    function makeSource(fixturePath) {
      return {
        key: "docs-release-notes",
        name: "Anthropic Docs Release Notes",
        category: "core",
        scraperType: "docs-page",
        parseMode: "docs-hash",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
        fixtureFile: fixturePath,
      };
    }

    it("returns item with hash-based id", async () => {
      const html = `<!DOCTYPE html><html><body>
<h1>Models</h1>
<table><tr><td>Claude 4</td><td>Latest</td></tr></table>
<p>Model documentation content here.</p>
</body></html>`;
      const fixturePath = join(tmpDir, "docs.html");
      await writeFile(fixturePath, html);

      const items = await scrapeDocsPage(makeSource(fixturePath));

      expect(items.length).toBe(1);
      expect(items[0].id).toMatch(/^[0-9a-f]{12}$/);
      expect(items[0].title).toBe("Models");
      expect(items[0].sourceCategory).toBe("core");
      expect(items[0].sourceName).toBe("Anthropic Docs Release Notes");
    });

    it("has all required fields", async () => {
      const html = `<html><body><h1>Test</h1><p>Content</p></body></html>`;
      const fixturePath = join(tmpDir, "docs.html");
      await writeFile(fixturePath, html);

      const items = await scrapeDocsPage(makeSource(fixturePath));
      for (const field of requiredFields) {
        expect(items[0]).toHaveProperty(field);
      }
    });

    it("different content produces different hash", async () => {
      const path1 = join(tmpDir, "docs1.html");
      const path2 = join(tmpDir, "docs2.html");
      await writeFile(
        path1,
        "<html><body><h1>A</h1><p>Content A</p></body></html>",
      );
      await writeFile(
        path2,
        "<html><body><h1>B</h1><p>Content B</p></body></html>",
      );

      const items1 = await scrapeDocsPage(makeSource(path1));
      const items2 = await scrapeDocsPage(makeSource(path2));

      expect(items1[0].id).not.toBe(items2[0].id);
    });
  });

  describe("model-table mode", () => {
    function makeSource(fixturePath) {
      return {
        key: "docs-release-notes",
        name: "Anthropic Docs Release Notes",
        category: "core",
        scraperType: "docs-page",
        parseMode: "model-table",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
        fixtureFile: fixturePath,
      };
    }

    const realFixture = join(FIXTURE_DIR, "docs-release-notes.html");

    it("emits one item per model with all required fields", async () => {
      const items = await scrapeDocsPage(makeSource(realFixture));

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        for (const field of requiredFields) {
          expect(item).toHaveProperty(field);
        }
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.url).toContain(
          "https://docs.anthropic.com/en/docs/about-claude/models",
        );
      }
    });

    it("produces stable ids across repeated runs of the same fixture", async () => {
      const items1 = await scrapeDocsPage(makeSource(realFixture));
      const items2 = await scrapeDocsPage(makeSource(realFixture));

      expect(items1.length).toBe(items2.length);
      expect(items1.map((i) => i.id)).toEqual(items2.map((i) => i.id));
    });

    it("throws when HTML has no <table> (malformed page)", async () => {
      const fixturePath = join(tmpDir, "no-table.html");
      await writeFile(
        fixturePath,
        "<!DOCTYPE html><html><body><h1>Models</h1><p>No table here.</p></body></html>",
      );

      await expect(scrapeDocsPage(makeSource(fixturePath))).rejects.toThrow();
    });
  });

  describe("intercom-article mode", () => {
    function makeSource(fixturePath) {
      return {
        key: "support-release-notes",
        name: "Anthropic Support Release Notes",
        category: "core",
        scraperType: "docs-page",
        parseMode: "intercom-article",
        url: "https://support.claude.com/en/articles/12138966-release-notes",
        fixtureFile: fixturePath,
      };
    }

    it("parses intercom article with h3 date headers", async () => {
      const html = `<!DOCTYPE html><html><body>
<div class="article_body">
  <h3 id="jan-2026">January 15, 2026</h3>
  <p><strong>New Feature</strong></p>
  <p>We added a new feature to Claude.</p>
  <h3 id="dec-2025">December 1, 2025</h3>
  <p><b>Bug Fix</b></p>
  <p>Fixed an issue.</p>
</div>
</body></html>`;
      const fixturePath = join(tmpDir, "article.html");
      await writeFile(fixturePath, html);

      const items = await scrapeDocsPage(makeSource(fixturePath));

      expect(items.length).toBe(2);
      expect(items[0].title).toBe("New Feature");
      expect(items[0].url).toContain("#jan-2026");
      expect(items[0].sourceCategory).toBe("core");
    });
  });

  describe("error handling", () => {
    it("returns [] for empty HTML", async () => {
      const fixturePath = join(tmpDir, "empty.html");
      await writeFile(fixturePath, "<!DOCTYPE html><html><body></body></html>");

      const items = await scrapeDocsPage({
        key: "support-release-notes",
        name: "Test",
        category: "core",
        scraperType: "docs-page",
        parseMode: "intercom-article",
        url: "https://support.claude.com/en/articles/12138966-release-notes",
        fixtureFile: fixturePath,
      });
      expect(items).toEqual([]);
    });

    it("throws for nonexistent file", async () => {
      await expect(
        scrapeDocsPage({
          key: "docs-release-notes",
          name: "Test",
          category: "core",
          scraperType: "docs-page",
          parseMode: "docs-hash",
          url: "https://docs.anthropic.com/en/docs/about-claude/models",
          fixtureFile: join(tmpDir, "nonexistent.html"),
        }),
      ).rejects.toThrow();
    });
  });
});
