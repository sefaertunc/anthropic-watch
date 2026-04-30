import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import via the public/ module. The pure named exports work in Node;
// the DOM entrypoint at the bottom of the module is gated by
// `typeof document !== "undefined"`.
const { computeCronFreshnessState, aggregateOverall, buildIndicatorRows } =
  await import("../../public/health-render.js");

const aggregateCases = JSON.parse(
  readFileSync(
    join(__dirname, "..", "fixtures", "aggregate-cases.json"),
    "utf-8",
  ),
);

describe("computeCronFreshnessState", () => {
  const thresholdHours = { warning: 24, fired: 36 };
  const generatedAt = "2026-01-01T00:00:00.000Z";

  it("returns ok at 1h ago", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    expect(
      computeCronFreshnessState({ generatedAt, now, thresholdHours }),
    ).toBe("ok");
  });

  it("returns warning at 25h ago", () => {
    const now = new Date("2026-01-02T01:00:00.000Z");
    expect(
      computeCronFreshnessState({ generatedAt, now, thresholdHours }),
    ).toBe("warning");
  });

  it("returns fired at 37h ago", () => {
    const now = new Date("2026-01-02T13:00:00.000Z");
    expect(
      computeCronFreshnessState({ generatedAt, now, thresholdHours }),
    ).toBe("fired");
  });

  it("returns ok at exactly 24h boundary (strict >)", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(
      computeCronFreshnessState({ generatedAt, now, thresholdHours }),
    ).toBe("ok");
  });

  it("returns warning at exactly 36h boundary (strict >)", () => {
    const now = new Date("2026-01-02T12:00:00.000Z");
    expect(
      computeCronFreshnessState({ generatedAt, now, thresholdHours }),
    ).toBe("warning");
  });
});

describe("aggregateOverall — fixture parity (client-side)", () => {
  it("matches expectedOverall for every aggregate-cases fixture entry", () => {
    for (const fixture of aggregateCases) {
      expect(aggregateOverall(fixture.indicators)).toBe(
        fixture.expectedOverall,
      );
    }
  });
});

describe("aggregateOverall — server/client parity", async () => {
  const { aggregateOverall: serverAggregate } =
    await import("../../src/feed/health.js");

  it("server and client implementations agree on every fixture case", () => {
    for (const fixture of aggregateCases) {
      const server = serverAggregate(fixture.indicators);
      const client = aggregateOverall(fixture.indicators);
      expect(JSON.stringify(server)).toBe(JSON.stringify(client));
    }
  });
});

describe("buildIndicatorRows — render-input shape", () => {
  it("produces a single 'data unavailable' row when feedHealth is null", () => {
    const rows = buildIndicatorRows(null, new Date("2026-01-01T00:00:00Z"));
    expect(rows).toEqual([
      { label: "Feed health data unavailable", state: "neutral", summary: "" },
    ]);
  });

  it("produces a single 'data unavailable' row on schemaVersion major mismatch", () => {
    const rows = buildIndicatorRows(
      { schemaVersion: "2.0", indicators: {}, summary: {} },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(rows[0].label).toBe("Feed health data unavailable");
  });

  it("produces a single 'computation failed' row when error is set", () => {
    const rows = buildIndicatorRows(
      {
        schemaVersion: "1.0",
        error: "boom",
        indicators: {},
        summary: { serverOverall: "fired", byState: {} },
      },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe("fired");
    expect(rows[0].summary).toBe("boom");
  });

  it("renders four indicators with cronFreshness state computed at read time", () => {
    const generatedAt = "2026-01-01T00:00:00.000Z";
    const feedHealth = {
      schemaVersion: "1.0",
      generatedAt,
      indicators: {
        runHistoryDepth: { state: "ok", summary: "depth ok" },
        allJsonItemCount: { state: "warning", summary: "count low" },
        perSourceFeedContinuity: { state: "ok", summary: "continuity ok" },
        cronFreshness: {
          thresholdHours: { warning: 24, fired: 36 },
          summary: "inputs only",
        },
      },
      summary: { serverOverall: "warning", byState: {} },
    };
    const now = new Date("2026-01-02T13:00:00.000Z"); // 37h
    const rows = buildIndicatorRows(feedHealth, now);
    expect(rows.length).toBe(4);
    expect(rows[3].label).toBe("Cron freshness");
    expect(rows[3].state).toBe("fired");
  });
});
