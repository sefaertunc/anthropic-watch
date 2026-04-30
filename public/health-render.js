// Dashboard helpers for the Feed Health section.
//
// Pure functions are exported as named exports so vitest can unit-test them
// directly without JSDOM. The DOM entrypoint runs on DOMContentLoaded when the
// module is loaded as <script type="module" src="./health-render.js">.

const INDICATOR_ORDER = [
  "runHistoryDepth",
  "allJsonItemCount",
  "perSourceFeedContinuity",
  "cronFreshness",
];

const INDICATOR_LABELS = {
  runHistoryDepth: "Run history depth",
  allJsonItemCount: "all.json item count",
  perSourceFeedContinuity: "Per-source continuity",
  cronFreshness: "Cron freshness",
};

export function computeCronFreshnessState({
  generatedAt,
  now,
  thresholdHours,
}) {
  const ageHours = (now.getTime() - new Date(generatedAt).getTime()) / 3600000;
  if (ageHours > thresholdHours.fired) return "fired";
  if (ageHours > thresholdHours.warning) return "warning";
  return "ok";
}

export function aggregateOverall(indicators) {
  const states = Object.values(indicators)
    .map((i) => i?.state)
    .filter((s) => s !== undefined);
  if (states.includes("fired")) return "fired";
  if (states.includes("warning")) return "warning";
  return "ok";
}

export function renderIndicatorRow({ label, state, summary }) {
  const row = document.createElement("div");
  row.className = "health-indicator";

  const dotClass =
    state === "fired"
      ? "dot-red"
      : state === "warning"
        ? "dot-amber"
        : state === "ok"
          ? "dot-green"
          : "dot-neutral";

  const dot = document.createElement("span");
  dot.className = `dot ${dotClass}`;
  row.appendChild(dot);

  const labelEl = document.createElement("span");
  labelEl.className = "health-label";
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const summaryEl = document.createElement("span");
  summaryEl.className = "health-summary";
  summaryEl.textContent = summary || "";
  row.appendChild(summaryEl);

  return row;
}

export function buildIndicatorRows(feedHealth, now = new Date()) {
  if (!feedHealth || feedHealth.schemaVersion?.split(".")[0] !== "1") {
    return [
      {
        label: "Feed health data unavailable",
        state: "neutral",
        summary: "",
      },
    ];
  }
  if (feedHealth.error !== undefined) {
    return [
      {
        label: "Feed-health computation failed",
        state: "fired",
        summary: feedHealth.error,
      },
    ];
  }

  const rows = [];
  for (const key of INDICATOR_ORDER) {
    const ind = feedHealth.indicators?.[key];
    if (!ind) continue;
    let state = ind.state;
    if (key === "cronFreshness") {
      state = computeCronFreshnessState({
        generatedAt: feedHealth.generatedAt,
        now,
        thresholdHours: ind.thresholdHours,
      });
    }
    rows.push({
      label: INDICATOR_LABELS[key] || key,
      state,
      summary: ind.summary || "",
    });
  }
  return rows;
}

async function renderFeedHealthPanel() {
  const strip = document.getElementById("indicator-strip");
  if (!strip) return;
  strip.textContent = "";

  let feedHealth = null;
  try {
    const res = await fetch("feeds/feed-health.json");
    if (res.ok) feedHealth = await res.json();
  } catch {
    feedHealth = null;
  }

  const rows = buildIndicatorRows(feedHealth, new Date());
  for (const row of rows) {
    strip.appendChild(renderIndicatorRow(row));
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderFeedHealthPanel);
  } else {
    renderFeedHealthPanel();
  }
}
