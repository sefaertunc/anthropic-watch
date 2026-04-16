import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeNpmRegistry } from "../../src/scrapers/npm-registry.js";

describe("scrapeNpmRegistry", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(latestPath, fullPath) {
    return {
      key: "npm-claude-code",
      name: "Claude Code npm Package",
      category: "core",
      scraperType: "npm-registry",
      packageName: "@anthropic-ai/claude-code",
      url: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
      fixtureFile: latestPath,
      fixtureFileFull: fullPath || null,
    };
  }

  it("parses npm latest and returns correct item", async () => {
    const latest = { version: "1.2.3", description: "Claude Code CLI tool" };
    const full = { time: { "1.2.3": "2026-03-15T10:00:00.000Z" } };

    const latestPath = join(tmpDir, "latest.json");
    const fullPath = join(tmpDir, "full.json");
    await writeFile(latestPath, JSON.stringify(latest));
    await writeFile(fullPath, JSON.stringify(full));

    const items = await scrapeNpmRegistry(makeSource(latestPath, fullPath));

    expect(items.length).toBe(1);
    expect(items[0].id).toBe("1.2.3");
    expect(items[0].title).toBe("@anthropic-ai/claude-code@1.2.3");
    expect(items[0].date).toBe("2026-03-15T10:00:00.000Z");
    expect(items[0].source).toBe("npm-claude-code");
    expect(items[0].sourceCategory).toBe("core");
    expect(items[0].sourceName).toBe("Claude Code npm Package");
  });

  it("has all 8 required fields", async () => {
    const latest = { version: "1.0.0", description: "Test" };
    const latestPath = join(tmpDir, "latest.json");
    await writeFile(latestPath, JSON.stringify(latest));

    const items = await scrapeNpmRegistry(makeSource(latestPath));
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

  it("snippet is capped at 300 chars", async () => {
    const latest = { version: "1.0.0", description: "A".repeat(500) };
    const latestPath = join(tmpDir, "latest.json");
    await writeFile(latestPath, JSON.stringify(latest));

    const items = await scrapeNpmRegistry(makeSource(latestPath));
    expect(items[0].snippet.length).toBeLessThanOrEqual(300);
  });

  it("throws for malformed input", async () => {
    const latestPath = join(tmpDir, "bad.json");
    await writeFile(latestPath, "not json");

    await expect(scrapeNpmRegistry(makeSource(latestPath))).rejects.toThrow();
  });
});
