import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeGithubReleases } from "../../src/scrapers/github-releases.js";

describe("scrapeGithubReleases", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath) {
    return {
      key: "claude-code-releases",
      name: "Claude Code Releases",
      category: "core",
      scraperType: "github-releases",
      owner: "anthropics",
      repo: "claude-code",
      url: "https://github.com/anthropics/claude-code/releases",
      fixtureFile: fixturePath,
    };
  }

  it("parses releases and returns correct item shape", async () => {
    const fixture = [
      {
        tag_name: "v1.0.0",
        name: "Version 1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url:
          "https://github.com/anthropics/claude-code/releases/tag/v1.0.0",
        body: "## Release Notes\n\n- Feature A\n- Feature B",
      },
      {
        tag_name: "v0.9.0",
        name: "Version 0.9.0",
        published_at: "2025-12-01T00:00:00Z",
        html_url:
          "https://github.com/anthropics/claude-code/releases/tag/v0.9.0",
        body: "Bug fixes",
      },
    ];
    const fixturePath = join(tmpDir, "releases.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeGithubReleases(makeSource(fixturePath));

    expect(items.length).toBe(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "v1.0.0",
        title: "Version 1.0.0",
        date: "2026-01-01T00:00:00Z",
        url: expect.stringContaining("v1.0.0"),
        source: "claude-code-releases",
        sourceCategory: "core",
        sourceName: "Claude Code Releases",
      }),
    );
    expect(items[0].snippet).toBeTruthy();
    expect(items[0].snippet.length).toBeLessThanOrEqual(300);
  });

  it("has all 8 required fields", async () => {
    const fixture = [
      {
        tag_name: "v1.0.0",
        name: "Test",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://example.com",
        body: "Test body",
      },
    ];
    const fixturePath = join(tmpDir, "releases.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeGithubReleases(makeSource(fixturePath));
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

  it("throws for malformed input", async () => {
    const fixturePath = join(tmpDir, "bad.json");
    await writeFile(fixturePath, "not json at all");

    await expect(
      scrapeGithubReleases(makeSource(fixturePath)),
    ).rejects.toThrow();
  });

  it("returns [] for empty array", async () => {
    const fixturePath = join(tmpDir, "empty.json");
    await writeFile(fixturePath, "[]");

    const items = await scrapeGithubReleases(makeSource(fixturePath));
    expect(items).toEqual([]);
  });

  it("snippet is capped at 300 chars", async () => {
    const longBody = "A".repeat(500);
    const fixture = [
      {
        tag_name: "v1.0.0",
        name: "Test",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://example.com",
        body: longBody,
      },
    ];
    const fixturePath = join(tmpDir, "long.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeGithubReleases(makeSource(fixturePath));
    expect(items[0].snippet.length).toBeLessThanOrEqual(300);
  });
});
