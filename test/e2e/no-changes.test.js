import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../../src/index.js";

describe("no-changes detection", () => {
  let tmpDir, stateDir, feedsDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-e2e-"));
    stateDir = join(tmpDir, "state");
    feedsDir = join(tmpDir, "feeds");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSources(fixturePath) {
    return [
      {
        key: "test-releases",
        name: "Test Releases",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "repo",
        url: "https://github.com/test/repo/releases",
        fixtureFile: fixturePath,
      },
    ];
  }

  it("run 2 with same fixtures produces 0 new items", async () => {
    const fixture = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Release v1",
      },
      {
        tag_name: "v0.9.0",
        name: "v0.9.0",
        published_at: "2025-12-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v0.9.0",
        body: "Release v0.9",
      },
    ];
    const fixturePath = join(tmpDir, "releases.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const sources = makeSources(fixturePath);

    // Run 1: should find N items
    const run1 = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });
    expect(run1.allNewItems.length).toBe(2);

    // Run 2: same fixtures, same state → 0 new items
    const run2 = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });
    expect(run2.allNewItems.length).toBe(0);

    // Feed accumulation preserves Run 1 items
    const allJson = JSON.parse(
      await readFile(join(feedsDir, "all.json"), "utf-8"),
    );
    expect(allJson.itemCount).toBe(2);
  });

  it("detects exactly the new items when fixture is updated", async () => {
    // Run 1: original fixture
    const fixture1 = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Release v1",
      },
    ];
    const fixturePath = join(tmpDir, "releases.json");
    await writeFile(fixturePath, JSON.stringify(fixture1));

    const sources = makeSources(fixturePath);
    const run1 = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });
    expect(run1.allNewItems.length).toBe(1);

    // Update fixture: add new version
    const fixture2 = [
      {
        tag_name: "v2.0.0",
        name: "v2.0.0",
        published_at: "2026-06-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v2.0.0",
        body: "Release v2",
      },
      ...fixture1,
    ];
    await writeFile(fixturePath, JSON.stringify(fixture2));

    // Run 2: should detect only the new item
    const run2 = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });
    expect(run2.allNewItems.length).toBe(1);
    expect(run2.allNewItems[0].id).toBe("v2.0.0");

    // Feed should have all items accumulated
    const allJson = JSON.parse(
      await readFile(join(feedsDir, "all.json"), "utf-8"),
    );
    expect(allJson.itemCount).toBe(2);
  });
});
