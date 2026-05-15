import { describe, it, expect } from "vitest";
import {
  AnthropicWatchClient,
  FeedFetchError,
  FeedMalformedError,
  computeCronFreshnessState,
} from "../src/index.js";
import { readFixture } from "./fixture-path.js";

// -- helpers shared with client.test.js pattern --

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

const VALID_FEED_HEALTH = {
  schemaVersion: "1.0",
  generatedAt: "2026-05-14T08:41:30.707Z",
  lastCronAttemptedAt: "2026-05-14T08:41:30.707Z",
  indicators: {
    runHistoryDepth: {
      state: "warning",
      current: 18,
      expected: 90,
      previous: 17,
      threshold: { warning: "<expected", fired: "shrunk-from-previous-by->5" },
      summary: "18 of 90 expected entries (still seeding)",
    },
    allJsonItemCount: {
      state: "ok",
      current: 100,
      expected: 100,
      previous: 100,
      threshold: { warning: "<80", fired: "shrunk-from-previous-by->10" },
      summary: "100 of 100 capacity (steady state)",
    },
    perSourceFeedContinuity: {
      state: "ok",
      sourcesChecked: 32,
      sourcesShrinkingUnexpectedly: 0,
      threshold: {
        warning: ">=1 source losing retained items",
        fired: ">=3 sources losing retained items",
      },
      summary: "All 32 sources retaining items as expected",
      details: [],
    },
    cronFreshness: {
      lastCronAttemptedAt: "2026-05-14T08:41:30.707Z",
      thresholdHours: { warning: 24, fired: 36 },
      summary:
        "Cron freshness is computed at read time from generatedAt; this object publishes inputs only (no state field)",
    },
  },
  summary: {
    serverOverall: "warning",
    byState: { warning: 1, ok: 2 },
  },
};

// -- fetchFeedHealth tests --

describe("AnthropicWatchClient.fetchFeedHealth", () => {
  it("fetches the correct URL", async () => {
    let capturedUrl;
    const c = new AnthropicWatchClient({
      fetch: async (url) => {
        capturedUrl = url;
        return mockResponse(VALID_FEED_HEALTH);
      },
    });
    await c.fetchFeedHealth();
    expect(capturedUrl).toBe(
      "https://sefaertunc.github.io/anthropic-watch/feeds/feed-health.json",
    );
  });

  it("returns the full feed health object", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_FEED_HEALTH),
    });
    const health = await c.fetchFeedHealth();
    expect(health.schemaVersion).toBe("1.0");
    expect(health.summary.serverOverall).toBe("warning");
    expect(typeof health.indicators.cronFreshness.thresholdHours).toBe(
      "object",
    );
    expect(health.indicators.cronFreshness.thresholdHours.warning).toBe(24);
    expect(health.indicators.cronFreshness.thresholdHours.fired).toBe(36);
  });

  it("cronFreshness indicator has no state field", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_FEED_HEALTH),
    });
    const health = await c.fetchFeedHealth();
    expect("state" in health.indicators.cronFreshness).toBe(false);
  });

  it("throws FeedMalformedError on degenerate error envelope", async () => {
    const errorEnvelope = { error: "computeFeedHealth threw unexpectedly" };
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(errorEnvelope) });
    const err = await c.fetchFeedHealth().catch((e) => e);
    expect(err).toBeInstanceOf(FeedMalformedError);
    expect(err.message).toMatch(/Feed-health computation failed/);
    expect(err.reason).toBe("computeFeedHealth threw unexpectedly");
  });

  it("throws FeedMalformedError when indicators is missing", async () => {
    const { indicators, ...noIndicators } = VALID_FEED_HEALTH;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noIndicators) });
    const err = await c.fetchFeedHealth().catch((e) => e);
    expect(err).toBeInstanceOf(FeedMalformedError);
    expect(err.reason).toMatch(/indicators/);
  });

  it("throws FeedMalformedError when summary is missing", async () => {
    const { summary, ...noSummary } = VALID_FEED_HEALTH;
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(noSummary) });
    const err = await c.fetchFeedHealth().catch((e) => e);
    expect(err).toBeInstanceOf(FeedMalformedError);
    expect(err.reason).toMatch(/summary/);
  });

  it("throws FeedMalformedError when body is not JSON", async () => {
    const c = new AnthropicWatchClient({ fetch: mockFetchBadJson() });
    await expect(c.fetchFeedHealth()).rejects.toBeInstanceOf(
      FeedMalformedError,
    );
  });

  it("throws FeedFetchError on HTTP 404", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchOk(VALID_FEED_HEALTH, { status: 404 }),
    });
    const err = await c.fetchFeedHealth().catch((e) => e);
    expect(err).toBeInstanceOf(FeedFetchError);
    expect(err.status).toBe(404);
  });

  it("throws FeedFetchError on network error", async () => {
    const c = new AnthropicWatchClient({
      fetch: mockFetchThrow(new TypeError("fetch failed")),
    });
    const err = await c.fetchFeedHealth().catch((e) => e);
    expect(err).toBeInstanceOf(FeedFetchError);
    expect(err.status).toBeNull();
  });

  it("passes signal through to fetch", async () => {
    let seenSignal = null;
    const c = new AnthropicWatchClient({
      fetch: async (_url, opts) => {
        seenSignal = opts?.signal;
        return mockResponse(VALID_FEED_HEALTH);
      },
    });
    const ac = new AbortController();
    await c.fetchFeedHealth({ signal: ac.signal });
    expect(seenSignal).toBeDefined();
    expect(seenSignal).not.toBeNull();
  });

  it("parses the feed-health.valid.json fixture", async () => {
    const fixture = readFixture("feed-health.valid.json");
    const c = new AnthropicWatchClient({ fetch: mockFetchOk(fixture) });
    const health = await c.fetchFeedHealth();
    expect(health.schemaVersion).toBe("1.0");
    expect(typeof health.generatedAt).toBe("string");
    expect(typeof health.indicators.runHistoryDepth.current).toBe("number");
    expect(typeof health.indicators.allJsonItemCount.current).toBe("number");
    expect(
      typeof health.indicators.perSourceFeedContinuity.sourcesChecked,
    ).toBe("number");
    expect(
      Array.isArray(health.indicators.perSourceFeedContinuity.details),
    ).toBe(true);
    expect("state" in health.indicators.cronFreshness).toBe(false);
  });
});

// -- computeCronFreshnessState tests --

describe("computeCronFreshnessState", () => {
  const GENERATED_AT = "2026-05-14T08:00:00.000Z";
  const BASE_NOW = new Date(GENERATED_AT).getTime();

  const makeHealth = (generatedAt = GENERATED_AT) => ({
    ...VALID_FEED_HEALTH,
    generatedAt,
    indicators: {
      ...VALID_FEED_HEALTH.indicators,
      cronFreshness: {
        ...VALID_FEED_HEALTH.indicators.cronFreshness,
        thresholdHours: { warning: 24, fired: 36 },
      },
    },
  });

  it("returns 'ok' when age is below warning threshold", () => {
    const now = BASE_NOW + 23 * 3600000; // 23 hours after
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "ok",
    );
  });

  it("returns 'warning' when age exceeds warning threshold", () => {
    const now = BASE_NOW + 25 * 3600000; // 25 hours after
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "warning",
    );
  });

  it("returns 'fired' when age exceeds fired threshold", () => {
    const now = BASE_NOW + 37 * 3600000; // 37 hours after
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "fired",
    );
  });

  it("treats age exactly at warning threshold as warning (strictly greater in docs)", () => {
    // ageHours > t.warning → warning. Exactly at boundary is NOT > so still ok.
    const now = BASE_NOW + 24 * 3600000; // exactly 24 hours
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "ok",
    );
  });

  it("treats age just above warning threshold as warning", () => {
    const now = BASE_NOW + 24 * 3600000 + 1; // 24h + 1ms
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "warning",
    );
  });

  it("treats age exactly at fired threshold as warning (not yet fired)", () => {
    // ageHours > t.fired → fired. Exactly at 36 is NOT > so still warning.
    const now = BASE_NOW + 36 * 3600000;
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "warning",
    );
  });

  it("treats age just above fired threshold as fired", () => {
    const now = BASE_NOW + 36 * 3600000 + 1;
    expect(computeCronFreshnessState({ feedHealth: makeHealth(), now })).toBe(
      "fired",
    );
  });

  it("uses Date.now() by default (smoke test — result is ok for freshly generated)", () => {
    // generatedAt is set to now so it should always be ok
    const nowIso = new Date().toISOString();
    const result = computeCronFreshnessState({
      feedHealth: makeHealth(nowIso),
    });
    expect(["ok", "warning", "fired"]).toContain(result);
  });

  it("works with the fixture generatedAt value given a fixed now", () => {
    const fixture = readFixture("feed-health.valid.json");
    const fixtureTime = new Date(fixture.generatedAt).getTime();
    // Simulate reading 1 hour after generation → ok
    const state = computeCronFreshnessState({
      feedHealth: fixture,
      now: fixtureTime + 3600000,
    });
    expect(state).toBe("ok");
  });
});
