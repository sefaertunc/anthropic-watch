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

    // Run 1: bad fixture on first run — scraper throws, rejected-promise path records failure
    // regardless of hasKnownIds (no more silent-success heuristic).
    const run1 = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: [failSource],
    });
    let state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(1);
    expect(run1.sourceResults[0].status).toBe("error");
    expect(run1.sourceResults[0].error).toBeTruthy();

    // Run 2: good fixture → success → reset
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [goodSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(0);
    expect(state.flaky.knownIds.length).toBeGreaterThan(0);

    // Run 3: bad fixture again → failure counter increments
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [failSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(1);

    // Run 4: good fixture → success → reset again
    await runPipeline({ stateDir, feedsDir, sourcesOverride: [goodSource] });
    state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state.flaky.consecutiveFailures).toBe(0);
  });

  it("new source failing on first run is recorded as error, not silent success", async () => {
    const badPath = join(tmpDir, "first-run-bad.json");
    await writeFile(badPath, "definitely not valid json");

    const source = {
      key: "brand-new",
      name: "Brand New Source",
      category: "core",
      scraperType: "github-releases",
      owner: "test",
      repo: "new",
      url: "https://github.com/test/new/releases",
      fixtureFile: badPath,
    };

    const result = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: [source],
    });

    // Before Issue 1/2: this was silently treated as success because first run has no knownIds.
    // After: the scraper throws, rejected-promise path records failure with err.message.
    const sr = result.sourceResults.find((r) => r.key === "brand-new");
    expect(sr.status).toBe("error");
    expect(sr.error).toBeTruthy();
    expect(sr.newItemCount).toBe(0);

    const state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state["brand-new"].consecutiveFailures).toBe(1);
  });
});
