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
});
