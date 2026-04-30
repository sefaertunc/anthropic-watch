import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../../src/index.js";
import * as healthModule from "../../src/feed/health.js";
import * as log from "../../src/log.js";

describe("feed-health carve-out — failure must not break feed publishing", () => {
  let tmpDir, stateDir, feedsDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-fh-iso-"));
    stateDir = join(tmpDir, "state");
    feedsDir = join(tmpDir, "feeds");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("publishes all standard feeds and a degenerate feed-health envelope when computeFeedHealth throws", async () => {
    const releasesPath = join(tmpDir, "releases.json");
    await writeFile(
      releasesPath,
      JSON.stringify([
        {
          tag_name: "v1.0.0",
          name: "v1.0.0",
          published_at: "2026-01-01T00:00:00Z",
          html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
          body: "notes",
        },
      ]),
    );

    const sources = [
      {
        key: "test-releases",
        name: "Test Releases",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "repo",
        url: "https://github.com/test/repo/releases",
        fixtureFile: releasesPath,
      },
    ];

    const spy = vi
      .spyOn(healthModule, "computeFeedHealth")
      .mockRejectedValue(new Error("boom"));
    const warnSpy = vi.spyOn(log, "warn").mockImplementation(() => {});

    await expect(
      runPipeline({ stateDir, feedsDir, sourcesOverride: sources }),
    ).resolves.toBeTruthy();

    // standard feeds still written
    expect(
      JSON.parse(await readFile(join(feedsDir, "all.json"), "utf-8")),
    ).toBeTruthy();
    expect(await readFile(join(feedsDir, "all.xml"), "utf-8")).toContain(
      "<rss",
    );
    expect(
      JSON.parse(await readFile(join(feedsDir, "run-history.json"), "utf-8"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      JSON.parse(await readFile(join(feedsDir, "run-report.json"), "utf-8"))
        .version,
    ).toBe("1.0");

    // degenerate envelope present
    const fh = JSON.parse(
      await readFile(join(feedsDir, "feed-health.json"), "utf-8"),
    );
    expect(fh.error).toBe("boom");
    expect(fh.summary.serverOverall).toBe("fired");
    expect(fh.indicators).toEqual({});

    // log.warn called
    expect(warnSpy).toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((args) =>
        String(args[0]).includes("Feed-health computation failed"),
      ),
    ).toBe(true);

    spy.mockRestore();
  });

  it("populates previousFeedHealth on the second run for shrinkage detection", async () => {
    const writeReleaseFixture = async (path, tag, date) => {
      const data = [
        {
          tag_name: tag,
          name: tag,
          published_at: date,
          html_url: `https://github.com/test/repo/releases/tag/${tag}`,
          body: `notes for ${tag}`,
        },
      ];
      await writeFile(path, JSON.stringify(data));
      return path;
    };
    const sourceFor = (fixture) => [
      {
        key: "test-releases",
        name: "Test Releases",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "repo",
        url: "https://github.com/test/repo/releases",
        fixtureFile: fixture,
      },
    ];

    const fix1 = await writeReleaseFixture(
      join(tmpDir, "r-1.json"),
      "v1.0.0",
      "2026-01-01T00:00:00Z",
    );
    await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sourceFor(fix1),
    });
    const fh1 = JSON.parse(
      await readFile(join(feedsDir, "feed-health.json"), "utf-8"),
    );
    expect(fh1.schemaVersion).toBe("1.0");
    expect(fh1.indicators.runHistoryDepth.previous).toBeNull();

    const fix2 = await writeReleaseFixture(
      join(tmpDir, "r-2.json"),
      "v2.0.0",
      "2026-02-01T00:00:00Z",
    );
    await runPipeline({
      stateDir: join(tmpDir, "state-2"),
      feedsDir,
      sourcesOverride: sourceFor(fix2),
    });
    const fh2 = JSON.parse(
      await readFile(join(feedsDir, "feed-health.json"), "utf-8"),
    );
    expect(fh2.indicators.runHistoryDepth.previous).toBe(1);
    expect(fh2.indicators.runHistoryDepth.current).toBe(2);
  });
});
