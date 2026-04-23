import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  AnthropicWatchClient,
  FeedVersionMismatchError,
  FeedFetchError,
  FeedMalformedError,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../fixtures");

function readFixture(name) {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf8"));
}

function mockResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function mockFetchOk(body, { status = 200 } = {}) {
  return async () => mockResponse(body, { status });
}

function mockFetchThrow(err) {
  return async () => {
    throw err;
  };
}

function mockFetchBadJson() {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  });
}

const VALID_FEED = {
  version: "1.0",
  title: "t",
  description: "d",
  home_page_url: "https://x/",
  generator: "g",
  ttl: 1440,
  generated: "2026-04-23T00:00:00.000Z",
  itemCount: 1,
  items: [
    {
      id: "v1.0.0",
      uniqueKey: "v1.0.0|example",
      title: "Example",
      date: "2026-04-22T00:00:00.000Z",
      url: "https://example.com/",
      snippet: "x",
      source: "example",
      sourceCategory: "core",
      sourceName: "Example Source",
    },
  ],
};

const VALID_RUN_REPORT = {
  version: "1.0",
  runId: "r1",
  timestamp: "2026-04-23T00:00:00.000Z",
  duration_ms: 1234,
  summary: {
    totalNewItems: 1,
    sourcesChecked: 1,
    sourcesWithErrors: 0,
    healthySources: 1,
  },
  sources: [],
};

describe("AnthropicWatchClient constructor", () => {
  it("uses defaults when no options", () => {
    const c = new AnthropicWatchClient({ fetch: () => {} });
    expect(c.baseUrl).toBe("https://sefaertunc.github.io/anthropic-watch/");
    expect(c.timeout).toBe(10000);
  });

  it("uses override baseUrl", () => {
    const c = new AnthropicWatchClient({
      baseUrl: "http://local/",
      fetch: () => {},
    });
    expect(c.baseUrl).toBe("http://local/");
  });

  it("normalizes baseUrl without trailing slash", () => {
    const c = new AnthropicWatchClient({
      baseUrl: "http://local",
      fetch: () => {},
    });
    expect(c.baseUrl).toBe("http://local/");
  });

  it("normalizes baseUrl with trailing slash (idempotent)", () => {
    const c = new AnthropicWatchClient({
      baseUrl: "http://local/",
      fetch: () => {},
    });
    expect(c.baseUrl).toBe("http://local/");
  });

  it("throws TypeError when no fetch is available", () => {
    // Save and temporarily remove globalThis.fetch
    const savedFetch = globalThis.fetch;
    // @ts-expect-error — intentional for test
    delete globalThis.fetch;
    try {
      expect(() => new AnthropicWatchClient()).toThrow(TypeError);
      expect(() => new AnthropicWatchClient()).toThrow(/no fetch/);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});

describe("AnthropicWatchClient.fetchAllItems", () => {
  let fetchCalls;
  beforeEach(() => {
    fetchCalls = [];
  });

  it("returns items when feed is valid v1.0", async () => {
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(VALID_FEED) });
    const items = await c.fetchAllItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("v1.0.0");
  });

  it("fetches the correct URL", async () => {
    const spyFetch = async (url) => {
      fetchCalls.push(url);
      return mockResponse(VALID_FEED);
    };
    const c = new AnthropicWatchClient({ fetch: spyFetch });
    await c.fetchAllItems();
    expect(fetchCalls[0]).toBe(
      "https://sefaertunc.github.io/anthropic-watch/feeds/all.json",
    );
  });

  it("throws FeedVersionMismatchError on version 2.0", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk({ ...VALID_FEED, version: "2.0" }),
    });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(
      FeedVersionMismatchError,
    );
  });

  it("throws FeedVersionMismatchError when version is missing", async () => {
    const { version, ...noVersion } = VALID_FEED;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noVersion) });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(
      FeedVersionMismatchError,
    );
  });

  it("throws FeedMalformedError when response body is not JSON", async () => {
    const c = new AnthropicWatchClient({ fetch: mockFetchBadJson() });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(FeedMalformedError);
  });

  it("throws FeedMalformedError when feed.items is missing", async () => {
    const { items, ...noItems } = VALID_FEED;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noItems) });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(FeedMalformedError);
  });

  it("throws FeedMalformedError when feed.items is not an array", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk({ ...VALID_FEED, items: "not-array" }),
    });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(FeedMalformedError);
  });

  it("throws FeedFetchError on HTTP 500", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_FEED, { status: 500 }),
    });
    const err = await c.fetchAllItems().catch((e) => e);
    expect(err).toBeInstanceOf(FeedFetchError);
    expect(err.status).toBe(500);
  });

  it("throws FeedFetchError on HTTP 404", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_FEED, { status: 404 }),
    });
    const err = await c.fetchAllItems().catch((e) => e);
    expect(err).toBeInstanceOf(FeedFetchError);
    expect(err.status).toBe(404);
  });

  it("throws FeedFetchError on network error with null status", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchThrow(new TypeError("fetch failed")),
    });
    const err = await c.fetchAllItems().catch((e) => e);
    expect(err).toBeInstanceOf(FeedFetchError);
    expect(err.status).toBeNull();
    expect(err.cause).toBeInstanceOf(TypeError);
  });

  it("passes signal through to fetch", async () => {
    let seenSignal = null;
    const c = new AnthropicWatchClient({
      fetch: async (_url, opts) => {
        seenSignal = opts?.signal;
        return mockResponse(VALID_FEED);
      },
    });
    const ac = new AbortController();
    await c.fetchAllItems({ signal: ac.signal });
    expect(seenSignal).toBeDefined();
    expect(seenSignal).not.toBeNull();
  });
});

describe("AnthropicWatchClient.fetchSourceItems", () => {
  it("fetches the source-specific URL", async () => {
    let capturedUrl;
    const c = new AnthropicWatchClient({
      fetch: async (url) => {
        capturedUrl = url;
        return mockResponse(VALID_FEED);
      },
    });
    await c.fetchSourceItems("claude-code-releases");
    expect(capturedUrl).toBe(
      "https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-releases.json",
    );
  });

  it("URL-encodes the source key", async () => {
    let capturedUrl;
    const c = new AnthropicWatchClient({
      fetch: async (url) => {
        capturedUrl = url;
        return mockResponse(VALID_FEED);
      },
    });
    await c.fetchSourceItems("weird/key with spaces");
    expect(capturedUrl).toContain("weird%2Fkey%20with%20spaces.json");
  });

  it("throws TypeError on empty-string source key", async () => {
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(VALID_FEED) });
    await expect(c.fetchSourceItems("")).rejects.toBeInstanceOf(TypeError);
  });

  it("throws TypeError on non-string source key", async () => {
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(VALID_FEED) });
    await expect(c.fetchSourceItems(42)).rejects.toBeInstanceOf(TypeError);
  });

  it("applies the same version-gate semantics as fetchAllItems", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk({ ...VALID_FEED, version: "2.0" }),
    });
    await expect(c.fetchSourceItems("x")).rejects.toBeInstanceOf(
      FeedVersionMismatchError,
    );
  });
});

describe("AnthropicWatchClient.fetchRunReport", () => {
  it("returns the full run report when valid", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_RUN_REPORT),
    });
    const report = await c.fetchRunReport();
    expect(report.version).toBe("1.0");
    expect(report.summary.totalNewItems).toBe(1);
  });

  it("version-gates the report", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk({ ...VALID_RUN_REPORT, version: "2.0" }),
    });
    await expect(c.fetchRunReport()).rejects.toBeInstanceOf(
      FeedVersionMismatchError,
    );
  });

  it("throws FeedMalformedError when summary is missing", async () => {
    const { summary, ...noSummary } = VALID_RUN_REPORT;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noSummary) });
    await expect(c.fetchRunReport()).rejects.toBeInstanceOf(FeedMalformedError);
  });

  it("throws FeedMalformedError when sources is missing", async () => {
    const { sources, ...noSources } = VALID_RUN_REPORT;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noSources) });
    await expect(c.fetchRunReport()).rejects.toBeInstanceOf(FeedMalformedError);
  });
});

describe("AnthropicWatchClient.filterNew (instance method)", () => {
  it("delegates to the pure helper", () => {
    const c = new AnthropicWatchClient({ fetch: () => {} });
    const items = [
      { id: "1", source: "a", uniqueKey: "1|a" },
      { id: "2", source: "a", uniqueKey: "2|a" },
    ];
    const fresh = c.filterNew(items, new Set(["1|a"]));
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).toBe("2");
  });
});

describe("fixture-based integration", () => {
  it("parses the reference all.valid.json fixture", async () => {
    const fixture = readFixture("all.valid.json");
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(fixture) });
    const items = await c.fetchAllItems();
    expect(items.length).toBe(fixture.items.length);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(typeof item.uniqueKey).toBe("string");
    }
  });

  it("throws FeedVersionMismatchError on the synthetic all.invalid.json", async () => {
    const fixture = readFixture("all.invalid.json");
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(fixture) });
    await expect(c.fetchAllItems()).rejects.toBeInstanceOf(
      FeedVersionMismatchError,
    );
  });

  it("parses the reference run-report.valid.json fixture", async () => {
    const fixture = readFixture("run-report.valid.json");
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(fixture) });
    const report = await c.fetchRunReport();
    expect(report.version).toBe("1.0");
    expect(Array.isArray(report.sources)).toBe(true);
  });
});
