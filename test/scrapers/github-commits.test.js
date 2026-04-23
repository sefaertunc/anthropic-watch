import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scrapeGithubCommits } from "../../src/scrapers/github-commits.js";

describe("scrapeGithubCommits", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeSource(fixturePath, overrides = {}) {
    return {
      key: "gh-commits-cookbooks",
      name: "anthropics/claude-cookbooks (main commits)",
      category: "community",
      scraperType: "github-commits",
      owner: "anthropics",
      repo: "claude-cookbooks",
      branch: "main",
      limit: 10,
      excludeBots: true,
      url: "https://github.com/anthropics/claude-cookbooks",
      fixtureFile: fixturePath,
      ...overrides,
    };
  }

  async function writeFixture(commits) {
    const fixturePath = join(tmpDir, "commits.json");
    await writeFile(fixturePath, JSON.stringify(commits));
    return fixturePath;
  }

  it("should parse commits and emit source/sourceCategory/sourceName when input is valid", async () => {
    const fixture = [
      {
        sha: "abcdef1234567890",
        html_url:
          "https://github.com/anthropics/claude-cookbooks/commit/abcdef1234567890",
        author: { login: "alice" },
        commit: {
          author: { name: "Alice", date: "2026-04-01T00:00:00Z" },
          message: "fix: correct the thing\n\nMore context here.",
        },
      },
      {
        sha: "0123456789abcdef",
        html_url:
          "https://github.com/anthropics/claude-cookbooks/commit/0123456789abcdef",
        author: { login: "bob" },
        commit: {
          author: { name: "Bob", date: "2026-04-02T00:00:00Z" },
          message: "docs: update README",
        },
      },
    ];
    const fixturePath = await writeFixture(fixture);

    const items = await scrapeGithubCommits(makeSource(fixturePath));

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "abcdef1",
        title: "fix: correct the thing",
        date: "2026-04-01T00:00:00Z",
        url: expect.stringContaining("/commit/abcdef1234567890"),
        snippet: "More context here.",
        source: "gh-commits-cookbooks",
        sourceCategory: "community",
        sourceName: "anthropics/claude-cookbooks (main commits)",
      }),
    );
  });

  it("should drop bracketed-bot commits when excludeBots is true", async () => {
    const fixture = [
      {
        sha: "aaaaaaa1111111",
        html_url: "https://github.com/x/y/commit/aaaaaaa1111111",
        author: { login: "dependabot[bot]" },
        commit: {
          author: { name: "dependabot[bot]", date: "2026-04-01T00:00:00Z" },
          message: "chore: bump dep",
        },
      },
      {
        sha: "bbbbbbb2222222",
        html_url: "https://github.com/x/y/commit/bbbbbbb2222222",
        author: { login: "alice" },
        commit: {
          author: { name: "Alice", date: "2026-04-02T00:00:00Z" },
          message: "feat: new thing",
        },
      },
    ];
    const fixturePath = await writeFixture(fixture);

    const items = await scrapeGithubCommits(makeSource(fixturePath));

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("bbbbbbb");
  });

  it("should filter bots when commit.author is null but commit.author.name ends in [bot]", async () => {
    const fixture = [
      {
        sha: "ccccccc3333333",
        html_url: "https://github.com/x/y/commit/ccccccc3333333",
        author: null,
        commit: {
          author: {
            name: "renovate[bot]",
            date: "2026-04-01T00:00:00Z",
          },
          message: "chore: renovate",
        },
      },
    ];
    const fixturePath = await writeFixture(fixture);

    const items = await scrapeGithubCommits(makeSource(fixturePath));
    expect(items).toHaveLength(0);
  });

  it("should keep bot commits when excludeBots is false", async () => {
    const fixture = [
      {
        sha: "ddddddd4444444",
        html_url: "https://github.com/x/y/commit/ddddddd4444444",
        author: { login: "dependabot[bot]" },
        commit: {
          author: { name: "dependabot[bot]", date: "2026-04-01T00:00:00Z" },
          message: "chore: bump",
        },
      },
    ];
    const fixturePath = await writeFixture(fixture);

    const items = await scrapeGithubCommits(
      makeSource(fixturePath, { excludeBots: false }),
    );
    expect(items).toHaveLength(1);
  });

  it("should fall back to SHA when commit message first line is empty", async () => {
    const fixture = [
      {
        sha: "eeeeeee5555555",
        html_url: "https://github.com/x/y/commit/eeeeeee5555555",
        author: { login: "alice" },
        commit: {
          author: { name: "Alice", date: "2026-04-01T00:00:00Z" },
          message: "",
        },
      },
    ];
    const fixturePath = await writeFixture(fixture);

    const items = await scrapeGithubCommits(makeSource(fixturePath));
    expect(items[0].title).toBe("eeeeeee");
  });

  it("should return empty array when input is []", async () => {
    const fixturePath = await writeFixture([]);
    const items = await scrapeGithubCommits(makeSource(fixturePath));
    expect(items).toEqual([]);
  });
});
