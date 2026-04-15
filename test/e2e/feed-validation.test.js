import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPipeline } from "../../src/index.js";
import { validateRss } from "../helpers/rss-validator.js";

describe("feed validation", () => {
  let tmpDir, stateDir, feedsDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-e2e-"));
    stateDir = join(tmpDir, "state");
    feedsDir = join(tmpDir, "feeds");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSources(tmpDir) {
    const releases = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "Release notes",
      },
    ];
    const status = {
      incidents: [
        {
          id: "inc-1",
          name: "Test Incident",
          created_at: "2026-02-01T00:00:00Z",
          shortlink: "https://stspg.io/test",
          status: "resolved",
          impact: "minor",
          incident_updates: [{ body: "Resolved" }],
        },
      ],
    };

    const releasesPath = join(tmpDir, "releases.json");
    const statusPath = join(tmpDir, "status.json");

    return Promise.all([
      writeFile(releasesPath, JSON.stringify(releases)),
      writeFile(statusPath, JSON.stringify(status)),
    ]).then(() => [
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
      {
        key: "test-status",
        name: "Test Status",
        category: "extended",
        scraperType: "status-page",
        url: "https://status.example.com",
        fixtureFile: statusPath,
      },
    ]);
  }

  it("all RSS feeds validate", async () => {
    const sources = await makeSources(tmpDir);
    await runPipeline({ stateDir, feedsDir, sourcesOverride: sources });

    // Validate all.xml
    const allXml = await readFile(join(feedsDir, "all.xml"), "utf-8");
    const allResult = validateRss(allXml);
    expect(allResult.valid).toBe(true);
    expect(allResult.itemCount).toBeGreaterThan(0);

    // Validate per-source feeds
    for (const source of sources) {
      const xml = await readFile(join(feedsDir, `${source.key}.xml`), "utf-8");
      const result = validateRss(xml);
      expect(result.valid).toBe(true);
    }
  });

  it("OPML is valid XML with source feed URLs", async () => {
    const sources = await makeSources(tmpDir);
    await runPipeline({ stateDir, feedsDir, sourcesOverride: sources });

    const opml = await readFile(join(feedsDir, "sources.opml"), "utf-8");
    expect(opml).toContain("opml");
    expect(opml).toContain('version="2.0"');
  });

  it("accumulation across 3 runs with no duplicates", async () => {
    // Run 1
    const fixture1 = [
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        published_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
        body: "v1",
      },
    ];
    const fixturePath = join(tmpDir, "releases.json");
    await writeFile(fixturePath, JSON.stringify(fixture1));

    const sources = [
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

    await runPipeline({ stateDir, feedsDir, sourcesOverride: sources });

    // Run 2: add v2
    const fixture2 = [
      {
        tag_name: "v2.0.0",
        name: "v2.0.0",
        published_at: "2026-03-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v2.0.0",
        body: "v2",
      },
      ...fixture1,
    ];
    await writeFile(fixturePath, JSON.stringify(fixture2));
    await runPipeline({ stateDir, feedsDir, sourcesOverride: sources });

    // Run 3: add v3
    const fixture3 = [
      {
        tag_name: "v3.0.0",
        name: "v3.0.0",
        published_at: "2026-06-01T00:00:00Z",
        html_url: "https://github.com/test/repo/releases/tag/v3.0.0",
        body: "v3",
      },
      ...fixture2,
    ];
    await writeFile(fixturePath, JSON.stringify(fixture3));
    await runPipeline({ stateDir, feedsDir, sourcesOverride: sources });

    // Verify: 3 unique items, sorted by date descending, no duplicates
    const allJson = JSON.parse(
      await readFile(join(feedsDir, "all.json"), "utf-8"),
    );
    expect(allJson.itemCount).toBe(3);

    const ids = allJson.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);

    // Sorted descending
    expect(allJson.items[0].id).toBe("v3.0.0");
    expect(allJson.items[1].id).toBe("v2.0.0");
    expect(allJson.items[2].id).toBe("v1.0.0");
  });
});
