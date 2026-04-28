import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../../src/index.js";

describe("full pipeline", () => {
  let tmpDir, stateDir, feedsDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-e2e-"));
    stateDir = join(tmpDir, "state");
    feedsDir = join(tmpDir, "feeds");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeGithubReleasesFixture(tmpDir) {
    const data = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Release notes for v1.0.0",
      },
    ];
    const path = join(tmpDir, "releases.json");
    return writeFile(path, JSON.stringify(data)).then(() => path);
  }

  function makeStatusFixture(tmpDir) {
    const data = {
      incidents: [
        {
          id: "inc-1",
          name: "Test Incident",
          created_at: "2026-01-15T00:00:00Z",
          shortlink: "https://stspg.io/test",
          status: "resolved",
          impact: "minor",
          incident_updates: [{ body: "All clear" }],
        },
      ],
    };
    const path = join(tmpDir, "status.json");
    return writeFile(path, JSON.stringify(data)).then(() => path);
  }

  it("runs pipeline with fixtures and produces expected outputs", async () => {
    const releasesFixture = await makeGithubReleasesFixture(tmpDir);
    const statusFixture = await makeStatusFixture(tmpDir);

    const sources = [
      {
        key: "test-releases",
        name: "Test Releases",
        category: "core",
        scraperType: "github-releases",
        owner: "test",
        repo: "repo",
        url: "https://github.com/test/repo/releases",
        fixtureFile: releasesFixture,
      },
      {
        key: "test-status",
        name: "Test Status",
        category: "extended",
        scraperType: "status-page",
        url: "https://status.example.com",
        fixtureFile: statusFixture,
      },
    ];

    const result = await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sources,
    });

    // Verify items were found
    expect(result.allNewItems.length).toBeGreaterThan(0);
    expect(result.sourceResults.length).toBe(2);

    // Verify feeds exist and are valid
    const allJson = JSON.parse(
      await readFile(join(feedsDir, "all.json"), "utf-8"),
    );
    expect(allJson.version).toBe("1.0");
    expect(allJson.itemCount).toBeGreaterThan(0);

    const allXml = await readFile(join(feedsDir, "all.xml"), "utf-8");
    expect(allXml).toContain("<rss");
    expect(allXml).toContain('version="2.0"');

    // Verify per-source feeds
    const sourceJson = JSON.parse(
      await readFile(join(feedsDir, "test-releases.json"), "utf-8"),
    );
    expect(sourceJson.itemCount).toBe(1);

    // Verify run report
    const report = JSON.parse(
      await readFile(join(feedsDir, "run-report.json"), "utf-8"),
    );
    expect(report.version).toBe("1.0");
    expect(report.summary.totalNewItems).toBeGreaterThan(0);
    expect(report.summary.sourcesChecked).toBe(2);

    // Verify state was created
    const state = JSON.parse(
      await readFile(join(stateDir, "last-seen.json"), "utf-8"),
    );
    expect(state["test-releases"]).toBeTruthy();
    expect(state["test-releases"].knownIds).toContain("v1.0.0");
  });

  it("accumulates items across consecutive runs against shared feedsDir", async () => {
    // Fresh stateDir on run 2 ensures the new fixture's items count as unseen;
    // state reuse would mask the disk-persistence boundary this test verifies.
    const writeReleaseFixture = async (path, tag, date) => {
      const data = [
        {
          tag_name: tag,
          name: tag,
          published_at: date,
          html_url: `https://github.com/test/repo/releases/tag/${tag}`,
          body: `Release notes for ${tag}`,
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
      join(tmpDir, "releases-1.json"),
      "v1.0.0",
      "2026-01-01T00:00:00Z",
    );
    await runPipeline({
      stateDir,
      feedsDir,
      sourcesOverride: sourceFor(fix1),
    });
    let all = JSON.parse(await readFile(join(feedsDir, "all.json"), "utf-8"));
    expect(all.itemCount).toBe(1);

    const fix2 = await writeReleaseFixture(
      join(tmpDir, "releases-2.json"),
      "v2.0.0",
      "2026-02-01T00:00:00Z",
    );
    const stateDir2 = join(tmpDir, "state-2");
    await runPipeline({
      stateDir: stateDir2,
      feedsDir,
      sourcesOverride: sourceFor(fix2),
    });
    all = JSON.parse(await readFile(join(feedsDir, "all.json"), "utf-8"));
    expect(all.itemCount).toBe(2);
    expect(all.items.map((i) => i.id)).toEqual(["v2.0.0", "v1.0.0"]);

    const history = JSON.parse(
      await readFile(join(feedsDir, "run-history.json"), "utf-8"),
    );
    expect(history.length).toBe(2);
  });
});
