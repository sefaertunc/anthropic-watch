import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeStatusPage } from "../../src/scrapers/status-page.js";

describe("scrapeStatusPage", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath) {
    return {
      key: "status-page",
      name: "Anthropic Status Page",
      category: "extended",
      scraperType: "status-page",
      url: "https://status.anthropic.com",
      fixtureFile: fixturePath,
    };
  }

  it("parses incidents correctly", async () => {
    const fixture = {
      incidents: [
        {
          id: "incident-1",
          name: "API Degraded Performance",
          created_at: "2026-01-15T10:00:00Z",
          shortlink: "https://stspg.io/abc123",
          status: "resolved",
          impact: "minor",
          incident_updates: [{ body: "Issue has been resolved." }],
        },
        {
          id: "incident-2",
          name: "Elevated Error Rates",
          created_at: "2026-01-14T08:00:00Z",
          shortlink: "https://stspg.io/def456",
          status: "monitoring",
          impact: "major",
          incident_updates: [{ body: "We are monitoring the situation." }],
        },
      ],
    };
    const fixturePath = join(tmpDir, "status.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeStatusPage(makeSource(fixturePath));

    expect(items.length).toBe(2);
    expect(items[0].id).toBe("incident-1");
    expect(items[0].title).toBe("API Degraded Performance");
    expect(items[0].snippet).toContain("[minor]");
    expect(items[0].snippet).toContain("resolved");
    expect(items[0].sourceCategory).toBe("extended");
    expect(items[0].sourceName).toBe("Anthropic Status Page");
  });

  it("has all 8 required fields", async () => {
    const fixture = {
      incidents: [
        {
          id: "inc-1",
          name: "Test",
          created_at: "2026-01-01T00:00:00Z",
          shortlink: "https://stspg.io/test",
          status: "resolved",
          impact: "none",
          incident_updates: [{ body: "Done" }],
        },
      ],
    };
    const fixturePath = join(tmpDir, "status.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeStatusPage(makeSource(fixturePath));
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

  it("returns [] for empty incidents", async () => {
    const fixture = { incidents: [] };
    const fixturePath = join(tmpDir, "empty.json");
    await writeFile(fixturePath, JSON.stringify(fixture));

    const items = await scrapeStatusPage(makeSource(fixturePath));
    expect(items).toEqual([]);
  });

  it("returns [] for malformed input", async () => {
    const fixturePath = join(tmpDir, "bad.json");
    await writeFile(fixturePath, "not json");

    const items = await scrapeStatusPage(makeSource(fixturePath));
    expect(items).toEqual([]);
  });
});
