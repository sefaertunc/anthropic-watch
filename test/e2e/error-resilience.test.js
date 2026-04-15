import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../../src/index.js";

describe("error resilience", () => {
  let tmpDir, stateDir, feedsDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-e2e-"));
    stateDir = join(tmpDir, "state");
    feedsDir = join(tmpDir, "feeds");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("one failing source does not affect others", async () => {
    const goodFixture = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Good release",
      },
    ];
    const goodPath = join(tmpDir, "good.json");
    await writeFile(goodPath, JSON.stringify(goodFixture));

    const badPath = join(tmpDir, "bad.json");
    await writeFile(badPath, "not json at all");

    const sources = [
      {
        key: "good-source",
        name: "Good Source",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "good",
        url: "https://github.com/test/good/releases",
        fixtureFile: goodPath,
      },
      {
        key: "bad-source",
        name: "Bad Source",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "bad",
        url: "https://github.com/test/bad/releases",
        fixtureFile: badPath,
      },
    ];

    const result = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });

    // Good source should have items
    const goodResult = result.sourceResults.find(
      (r) => r.key === "good-source",
    );
    expect(goodResult.status).toBe("ok");
    expect(goodResult.newItemCount).toBe(1);

    // Pipeline should complete without throwing
    expect(result.runReport).toBeTruthy();
    expect(result.runReport.summary.sourcesChecked).toBe(2);
  });

  it("no-matching-selectors returns 0 items, not crash", async () => {
    const html = `<!DOCTYPE html><html><body><div class="unrelated">Nothing here</div></body></html>`;
    const fixturePath = join(tmpDir, "no-match.html");
    await writeFile(fixturePath, html);

    const sources = [
      {
        key: "test-blog",
        name: "Test Blog",
        category: "core",
        scraperType: "blog-page",
        parseMode: "webflow",
        url: "https://example.com/blog",
        fixtureFile: fixturePath,
      },
    ];

    const result = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });
    expect(result.allNewItems.length).toBe(0);
    expect(result.runReport).toBeTruthy();
  });

  it("all sources failing produces valid empty feeds", async () => {
    const badPath = join(tmpDir, "bad.json");
    await writeFile(badPath, "corrupted");

    const sources = [
      {
        key: "fail-1",
        name: "Fail 1",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "fail",
        url: "https://github.com/test/fail/releases",
        fixtureFile: badPath,
      },
      {
        key: "fail-2",
        name: "Fail 2",
        category: "extended",
        scraperType: "status-page",
        url: "https://status.example.com",
        fixtureFile: badPath,
      },
    ];

    const result = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });

    // Should not throw
    expect(result.allNewItems.length).toBe(0);

    // Feeds should be valid but empty
    const allJson = JSON.parse(
      await readFile(join(feedsDir, "all.json"), "utf-8"),
    );
    expect(allJson.itemCount).toBe(0);
    expect(allJson.items).toEqual([]);
  });

  it("consecutiveFailures increments and resets correctly", async () => {
    const badPath = join(tmpDir, "bad.json");
    await writeFile(badPath, "corrupted");

    const goodFixture = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Good",
      },
    ];
    const goodPath = join(tmpDir, "good.json");
    await writeFile(goodPath, JSON.stringify(goodFixture));

    const failSource = {
      key: "flaky",
      name: "Flaky Source",
      category: "core",
      scraperType: "github-releases",
      owner: "test",
      repo: "flaky",
      url: "https://github.com/test/flaky/releases",
      fixtureFile: badPath,
    };

    const goodSource = { ...failSource, key: "flaky", fixtureFile: goodPath };

    // Run with bad fixture
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [failSource] });
    let state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    // First run with no knownIds — treated as success (0 items on first run is ok)
    // So consecutiveFailures should be 0
    expect(state.flaky.consecutiveFailures).toBe(0);

    // Run again — now it has knownIds: [] but length 0, so still treated as first run
    // Actually, after first run with bad fixture, scraper returns [], no items are marked seen
    // So knownIds stays empty. 0 items + no knownIds = success (first run)

    // Let's use a scenario where we first succeed, then fail
    // Run 1: good fixture → gets items
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [goodSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(0);
    expect(state.flaky.knownIds.length).toBeGreaterThan(0);

    // Run 2: bad fixture → 0 items but has knownIds → failure
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [failSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(1);

    // Run 3: good fixture → success → reset
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [goodSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(0);
  });
});
