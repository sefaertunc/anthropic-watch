import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { computeFeedHealth, aggregateOverall } from "../../src/feed/health.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const aggregateCases = JSON.parse(
  readFileSync(
    join(__dirname, "..", "fixtures", "aggregate-cases.json"),
    "utf-8",
  ),
);

async function setupFeedsDir({
  runHistoryLength = 0,
  allJsonItemCount = 0,
  perSourceFiles = {},
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "aw-fh-"));
  await writeFile(
    join(dir, "run-history.json"),
    JSON.stringify(
      Array.from({ length: runHistoryLength }, (_, i) => ({ i })),
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, "all.json"),
    JSON.stringify({ itemCount: allJsonItemCount, items: [] }),
  );
  for (const [key, items] of Object.entries(perSourceFiles)) {
    await writeFile(
      join(dir, `${key}.json`),
      JSON.stringify({ itemCount: items.length, items }),
    );
  }
  return dir;
}

function makeRunReport(sources = []) {
  return {
    version: "1.0",
    runId: "x",
    timestamp: new Date().toISOString(),
    duration_ms: 0,
    summary: {
      totalNewItems: 0,
      sourcesChecked: sources.length,
      sourcesWithErrors: 0,
      healthySources: sources.length,
    },
    sources,
  };
}

describe("computeFeedHealth — happy path", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("returns all-ok envelope when everything is at steady state", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`,
      source: "s1",
      uniqueKey: `i${i}|s1`,
    }));
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
      perSourceFiles: { s1: items },
    });
    const yesterday = new Map([["s1", items.slice(5).map((i) => i.uniqueKey)]]);
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport([
        {
          key: "s1",
          name: "S1",
          category: "core",
          status: "ok",
          newItemCount: 5,
        },
      ]),
      previousFeedHealth: {
        schemaVersion: "1.0",
        indicators: {
          runHistoryDepth: { current: 89 },
          allJsonItemCount: { current: 100 },
        },
      },
      previousPerSourceItems: yesterday,
    });

    expect(result.schemaVersion).toBe("1.0");
    expect(result.indicators.runHistoryDepth.state).toBe("ok");
    expect(result.indicators.allJsonItemCount.state).toBe("ok");
    expect(result.indicators.perSourceFeedContinuity.state).toBe("ok");
    expect(result.indicators.cronFreshness.state).toBeUndefined();
    expect(result.summary.serverOverall).toBe("ok");
    expect(result.summary.byState).toEqual({ ok: 3 });
  });
});

describe("checkRunHistoryDepth", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("fires on sudden shrinkage (v1.4.2 truncation regression)", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 1,
      allJsonItemCount: 100,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: {
        schemaVersion: "1.0",
        indicators: {
          runHistoryDepth: { current: 14 },
          allJsonItemCount: { current: 100 },
        },
      },
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.runHistoryDepth.state).toBe("fired");
    expect(result.indicators.runHistoryDepth.summary).toMatch(/regression/i);
  });

  it("warns on seeding when previous is null and current < expected", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 4,
      allJsonItemCount: 100,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: null,
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.runHistoryDepth.state).toBe("warning");
  });

  it("does not fire at boundary current=89 previous=90 (within epsilon)", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 89,
      allJsonItemCount: 100,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: {
        schemaVersion: "1.0",
        indicators: { runHistoryDepth: { current: 90 } },
      },
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.runHistoryDepth.state).toBe("warning");
  });
});

describe("checkAllJsonItemCount", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("fires when shrinks from 100 to 75 (drop > 10)", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 75,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: {
        schemaVersion: "1.0",
        indicators: { allJsonItemCount: { current: 100 } },
      },
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.allJsonItemCount.state).toBe("fired");
  });

  it("warns when 75 below floor but drop within epsilon (75 from 80)", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 75,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: {
        schemaVersion: "1.0",
        indicators: { allJsonItemCount: { current: 80 } },
      },
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.allJsonItemCount.state).toBe("warning");
  });
});

describe("checkPerSourceFeedContinuity", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("does not flag cap-saturated case: 50→50 with 5 new + 45 retained", async () => {
    const yesterdayItems = Array.from({ length: 50 }, (_, i) => ({
      id: `y${i}`,
      source: "s1",
      uniqueKey: `y${i}|s1`,
    }));
    const todayItems = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        source: "s1",
        uniqueKey: `n${i}|s1`,
      })),
      ...yesterdayItems.slice(0, 45),
    ];
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
      perSourceFiles: { s1: todayItems },
    });
    const yesterday = new Map([["s1", yesterdayItems.map((i) => i.uniqueKey)]]);
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport([
        {
          key: "s1",
          name: "S1",
          category: "core",
          status: "ok",
          newItemCount: 5,
        },
      ]),
      previousFeedHealth: null,
      previousPerSourceItems: yesterday,
    });
    expect(result.indicators.perSourceFeedContinuity.state).toBe("ok");
    expect(result.indicators.perSourceFeedContinuity.details).toEqual([]);
  });

  it("flags truncated source: yesterday 50, today 5 unrelated (per-source v1.4.2 regression)", async () => {
    const yesterdayItems = Array.from({ length: 50 }, (_, i) => ({
      id: `y${i}`,
      source: "s1",
      uniqueKey: `y${i}|s1`,
    }));
    const todayItems = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`,
      source: "s1",
      uniqueKey: `n${i}|s1`,
    }));
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
      perSourceFiles: { s1: todayItems },
    });
    const yesterday = new Map([["s1", yesterdayItems.map((i) => i.uniqueKey)]]);
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport([
        {
          key: "s1",
          name: "S1",
          category: "core",
          status: "ok",
          newItemCount: 5,
        },
      ]),
      previousFeedHealth: null,
      previousPerSourceItems: yesterday,
    });
    expect(result.indicators.perSourceFeedContinuity.state).toBe("warning");
    expect(result.indicators.perSourceFeedContinuity.details[0]).toMatchObject({
      source: "s1",
      retainedCount: 0,
      expectedRetained: 45,
    });
  });

  it("does not flag legitimate empty day: 50 yesterday, 50 today all-retained, 0 new", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `y${i}`,
      source: "s1",
      uniqueKey: `y${i}|s1`,
    }));
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
      perSourceFiles: { s1: items },
    });
    const yesterday = new Map([["s1", items.map((i) => i.uniqueKey)]]);
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport([
        {
          key: "s1",
          name: "S1",
          category: "core",
          status: "ok",
          newItemCount: 0,
        },
      ]),
      previousFeedHealth: null,
      previousPerSourceItems: yesterday,
    });
    expect(result.indicators.perSourceFeedContinuity.state).toBe("ok");
  });

  it("warns at 1-2 shrinking sources, fires at >=3", async () => {
    const buildShrunkSource = (key) => ({
      yesterday: Array.from({ length: 50 }, (_, i) => `y${i}|${key}`),
      today: [],
    });
    const sources = ["s1", "s2", "s3"];
    const yesterdayMap = new Map();
    const perSourceFiles = {};
    for (const key of sources) {
      const data = buildShrunkSource(key);
      yesterdayMap.set(key, data.yesterday);
      perSourceFiles[key] = data.today;
    }
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
      perSourceFiles,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(
        sources.map((key) => ({
          key,
          name: key,
          category: "core",
          status: "ok",
          newItemCount: 0,
        })),
      ),
      previousFeedHealth: null,
      previousPerSourceItems: yesterdayMap,
    });
    expect(result.indicators.perSourceFeedContinuity.state).toBe("fired");
    expect(result.indicators.perSourceFeedContinuity.details.length).toBe(3);
  });
});

describe("first-run safety", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("never fires shrinkage indicators without a baseline", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 1,
      allJsonItemCount: 0,
    });
    const result = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: null,
      previousPerSourceItems: new Map(),
    });
    expect(result.indicators.runHistoryDepth.state).not.toBe("fired");
    expect(result.indicators.allJsonItemCount.state).not.toBe("fired");
    expect(result.indicators.perSourceFeedContinuity.state).toBe("ok");
  });
});

describe("schema-version sentinel (major-version match)", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  async function runWithSchemaVersion(version) {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 1,
      allJsonItemCount: 0,
    });
    return computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: {
        schemaVersion: version,
        indicators: {
          runHistoryDepth: { current: 90 },
          allJsonItemCount: { current: 100 },
        },
      },
      previousPerSourceItems: new Map(),
    });
  }

  it("treats schemaVersion 0.9 as null (downgrade)", async () => {
    const r = await runWithSchemaVersion("0.9");
    expect(r.indicators.runHistoryDepth.previous).toBeNull();
  });

  it("treats schemaVersion 2.0 as null (breaking-version quarantine)", async () => {
    const r = await runWithSchemaVersion("2.0");
    expect(r.indicators.runHistoryDepth.previous).toBeNull();
  });

  it("accepts schemaVersion 1.1 (additive minor)", async () => {
    const r = await runWithSchemaVersion("1.1");
    expect(r.indicators.runHistoryDepth.previous).toBe(90);
  });
});

describe("cronFreshness indicator", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("publishes inputs only — no state field", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
    });
    const r = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: null,
      previousPerSourceItems: new Map(),
    });
    expect(r.indicators.cronFreshness.state).toBeUndefined();
    expect(r.indicators.cronFreshness.lastCronAttemptedAt).toBeTypeOf("string");
    expect(r.indicators.cronFreshness.thresholdHours).toEqual({
      warning: 24,
      fired: 36,
    });
  });
});

describe("aggregateOverall — fixture parity", () => {
  it("matches expectedOverall for every aggregate-cases fixture entry", () => {
    for (const fixture of aggregateCases) {
      expect(aggregateOverall(fixture.indicators)).toBe(
        fixture.expectedOverall,
      );
    }
  });
});

describe("summary.byState only counts indicators with state field", () => {
  let feedsDir;
  afterEach(() => feedsDir && rm(feedsDir, { recursive: true, force: true }));

  it("excludes cronFreshness from byState count", async () => {
    feedsDir = await setupFeedsDir({
      runHistoryLength: 90,
      allJsonItemCount: 100,
    });
    const r = await computeFeedHealth({
      feedsDir,
      runReport: makeRunReport(),
      previousFeedHealth: null,
      previousPerSourceItems: new Map(),
    });
    const total = Object.values(r.summary.byState).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });
});
