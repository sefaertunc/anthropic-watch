import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeGithubChangelog } from "../../src/scrapers/github-changelog.js";

describe("scrapeGithubChangelog", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath) {
    return {
      key: "claude-code-changelog",
      name: "Claude Code Changelog",
      category: "core",
      scraperType: "github-changelog",
      owner: "anthropics",
      repo: "claude-code",
      file: "CHANGELOG.md",
      url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
      fixtureFile: fixturePath,
    };
  }

  function makeFixture(markdown) {
    return JSON.stringify({
      name: "CHANGELOG.md",
      path: "CHANGELOG.md",
      sha: "abc123",
      content: Buffer.from(markdown).toString("base64"),
      encoding: "base64",
    });
  }

  it("parses changelog and uses first ## heading as id", async () => {
    const md =
      "# Changelog\n\n## 1.0.0\n\n### Features\n- New feature\n\n## 0.9.0\n\n- Old stuff\n";
    const fixturePath = join(tmpDir, "changelog.json");
    await writeFile(fixturePath, makeFixture(md));

    const items = await scrapeGithubChangelog(makeSource(fixturePath));

    expect(items.length).toBe(1);
    expect(items[0].id).toBe("1.0.0");
    expect(items[0].title).toBe("1.0.0");
    expect(items[0].source).toBe("claude-code-changelog");
    expect(items[0].sourceCategory).toBe("core");
    expect(items[0].sourceName).toBe("Claude Code Changelog");
  });

  it("has all 8 required fields", async () => {
    const md = "## 1.0.0\n\nContent here\n";
    const fixturePath = join(tmpDir, "changelog.json");
    await writeFile(fixturePath, makeFixture(md));

    const items = await scrapeGithubChangelog(makeSource(fixturePath));
    const fields = [
      "id",
      "title",
      "date",
      "url",
      "snippet",
      "source",
      "sourceCategory",
      "sourceName",
    ];
    for (const field of fields) {
      expect(items[0]).toHaveProperty(field);
    }
  });

  it("throws for malformed JSON", async () => {
    const fixturePath = join(tmpDir, "bad.json");
    await writeFile(fixturePath, "not json");

    await expect(
      scrapeGithubChangelog(makeSource(fixturePath)),
    ).rejects.toThrow();
  });

  it("same heading with different content produces the same id", async () => {
    const md1 = "## 1.0.0\n\nContent A\n\n## 0.9.0\n\nOld\n";
    const md2 = "## 1.0.0\n\nContent B different\n\n## 0.9.0\n\nOld\n";

    const path1 = join(tmpDir, "cl1.json");
    const path2 = join(tmpDir, "cl2.json");
    await writeFile(path1, makeFixture(md1));
    await writeFile(path2, makeFixture(md2));

    const items1 = await scrapeGithubChangelog(makeSource(path1));
    const items2 = await scrapeGithubChangelog(makeSource(path2));

    expect(items1[0].id).toBe("1.0.0");
    expect(items2[0].id).toBe("1.0.0");
    expect(items1[0].id).toBe(items2[0].id);
  });

  it("different headings produce different ids", async () => {
    const md1 = "## 1.0.0\n\nContent\n";
    const md2 = "## 1.0.1\n\nContent\n";

    const path1 = join(tmpDir, "cl1.json");
    const path2 = join(tmpDir, "cl2.json");
    await writeFile(path1, makeFixture(md1));
    await writeFile(path2, makeFixture(md2));

    const items1 = await scrapeGithubChangelog(makeSource(path1));
    const items2 = await scrapeGithubChangelog(makeSource(path2));

    expect(items1[0].id).toBe("1.0.0");
    expect(items2[0].id).toBe("1.0.1");
    expect(items1[0].id).not.toBe(items2[0].id);
  });

  it("content with no ## heading falls back to 12-char hash id", async () => {
    const md = "# Just a title\n\nNo version headings here.\n";
    const fixturePath = join(tmpDir, "no-headings.json");
    await writeFile(fixturePath, makeFixture(md));

    const items = await scrapeGithubChangelog(makeSource(fixturePath));

    expect(items.length).toBe(1);
    expect(items[0].id).toMatch(/^[0-9a-f]{12}$/);
    expect(items[0].title).toMatch(/^\(no heading — /);
  });
});
