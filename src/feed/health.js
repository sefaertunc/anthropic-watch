import { join } from "node:path";

import { readJsonSafe } from "../read-json-safe.js";

const SCHEMA_VERSION = "1.0";
const RUN_HISTORY_EXPECTED = 90;
const RUN_HISTORY_REGRESSION_EPSILON = 5;
const ALL_JSON_EXPECTED = 100;
const ALL_JSON_WARNING_FLOOR = 80;
const ALL_JSON_REGRESSION_EPSILON = 10;
const PER_SOURCE_CAP = 50;
const CRON_THRESHOLD_HOURS = { warning: 24, fired: 36 };

function checkRunHistoryDepth(runHistory, previousFeedHealth) {
  const expected = RUN_HISTORY_EXPECTED;
  const current = Array.isArray(runHistory) ? runHistory.length : 0;
  const previous =
    previousFeedHealth?.indicators?.runHistoryDepth?.current ?? null;

  let state = "ok";
  if (
    previous !== null &&
    current < previous - RUN_HISTORY_REGRESSION_EPSILON
  ) {
    state = "fired";
  } else if (current < expected) {
    state = "warning";
  }

  let summary;
  if (state === "fired") {
    summary = `run-history shrank from ${previous} to ${current} entries (regression)`;
  } else if (state === "warning") {
    summary = `${current} of ${expected} expected entries (still seeding)`;
  } else {
    summary = `${current} of ${expected} entries (steady state)`;
  }

  return {
    state,
    current,
    expected,
    previous,
    threshold: {
      warning: "<expected",
      fired: `shrunk-from-previous-by->${RUN_HISTORY_REGRESSION_EPSILON}`,
    },
    summary,
  };
}

function checkAllJsonItemCount(allJson, previousFeedHealth) {
  const expected = ALL_JSON_EXPECTED;
  const current = allJson?.itemCount ?? 0;
  const previous =
    previousFeedHealth?.indicators?.allJsonItemCount?.current ?? null;

  let state = "ok";
  if (previous !== null && current < previous - ALL_JSON_REGRESSION_EPSILON) {
    state = "fired";
  } else if (current < ALL_JSON_WARNING_FLOOR) {
    state = "warning";
  }

  let summary;
  if (state === "fired") {
    summary = `all.json shrank from ${previous} to ${current} items (regression)`;
  } else if (state === "warning") {
    summary = `${current} items (below ${ALL_JSON_WARNING_FLOOR}-item warning floor)`;
  } else {
    summary = `${current} of ${expected} capacity (steady state)`;
  }

  return {
    state,
    current,
    expected,
    previous,
    threshold: {
      warning: `<${ALL_JSON_WARNING_FLOOR}`,
      fired: `shrunk-from-previous-by->${ALL_JSON_REGRESSION_EPSILON}`,
    },
    summary,
  };
}

async function checkPerSourceFeedContinuity({
  feedsDir,
  runReport,
  previousPerSourceItems,
}) {
  const baseline =
    previousPerSourceItems instanceof Map ? previousPerSourceItems : new Map();
  const sources = runReport?.sources ?? [];
  const details = [];
  let sourcesChecked = 0;

  for (const source of sources) {
    const yesterdayKeys = baseline.get(source.key) ?? [];
    if (yesterdayKeys.length === 0) continue;
    sourcesChecked++;

    const todayFeed = await readJsonSafe(join(feedsDir, `${source.key}.json`));
    const todayItems = todayFeed?.items ?? [];
    const todayKeys = new Set(
      todayItems.map((it) => it.uniqueKey ?? `${it.id}|${it.source}`),
    );

    const retainedCount = yesterdayKeys.filter((k) => todayKeys.has(k)).length;
    const todayNewCount = source.newItemCount ?? 0;
    const expectedRetained = Math.min(
      yesterdayKeys.length,
      Math.max(0, PER_SOURCE_CAP - todayNewCount),
    );

    if (retainedCount < expectedRetained) {
      details.push({
        source: source.key,
        yesterdayCount: yesterdayKeys.length,
        todayCount: todayItems.length,
        retainedCount,
        expectedRetained,
      });
    }
  }

  let state = "ok";
  if (details.length >= 3) state = "fired";
  else if (details.length >= 1) state = "warning";

  let summary;
  if (state === "fired") {
    summary = `${details.length} sources lost retained items (regression)`;
  } else if (state === "warning") {
    summary = `${details.length} source(s) lost retained items`;
  } else {
    summary = `All ${sourcesChecked} sources retaining items as expected`;
  }

  return {
    state,
    sourcesChecked,
    sourcesShrinkingUnexpectedly: details.length,
    threshold: {
      warning: ">=1 source losing retained items",
      fired: ">=3 sources losing retained items",
    },
    summary,
    details,
  };
}

function cronFreshnessInputs({ now, thresholdHours }) {
  return {
    lastCronAttemptedAt: now.toISOString(),
    thresholdHours,
    summary:
      "Cron freshness is computed at read time from generatedAt; this object publishes inputs only (no state field)",
  };
}

export function aggregateOverall(indicators) {
  const states = Object.values(indicators)
    .map((i) => i?.state)
    .filter((s) => s !== undefined);
  if (states.includes("fired")) return "fired";
  if (states.includes("warning")) return "warning";
  return "ok";
}

function buildByState(indicators) {
  const counts = {};
  for (const ind of Object.values(indicators)) {
    if (ind?.state === undefined) continue;
    counts[ind.state] = (counts[ind.state] ?? 0) + 1;
  }
  return counts;
}

export async function computeFeedHealth({
  feedsDir,
  runReport,
  previousFeedHealth,
  previousPerSourceItems,
}) {
  const baseline =
    previousFeedHealth?.schemaVersion?.split(".")[0] === "1"
      ? previousFeedHealth
      : null;

  const runHistory = await readJsonSafe(join(feedsDir, "run-history.json"));
  const allJson = await readJsonSafe(join(feedsDir, "all.json"));
  const now = new Date();

  const runHistoryDepth = checkRunHistoryDepth(runHistory, baseline);
  const allJsonItemCount = checkAllJsonItemCount(allJson, baseline);
  const perSourceFeedContinuity = await checkPerSourceFeedContinuity({
    feedsDir,
    runReport,
    previousPerSourceItems,
  });
  const cronFreshness = cronFreshnessInputs({
    now,
    thresholdHours: CRON_THRESHOLD_HOURS,
  });

  const indicators = {
    runHistoryDepth,
    allJsonItemCount,
    perSourceFeedContinuity,
    cronFreshness,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    lastCronAttemptedAt: now.toISOString(),
    indicators,
    summary: {
      serverOverall: aggregateOverall(indicators),
      byState: buildByState(indicators),
    },
  };
}
