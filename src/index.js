import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { sources } from "./sources.js";
import {
  loadState,
  saveState,
  isNew,
  markSeen,
  recordSuccess,
  recordFailure,
} from "./state.js";
import { scrapeGithubReleases } from "./scrapers/github-releases.js";
import { scrapeGithubChangelog } from "./scrapers/github-changelog.js";
import { scrapeNpmRegistry } from "./scrapers/npm-registry.js";
import { scrapeBlogPage } from "./scrapers/blog-page.js";
import { scrapeDocsPage } from "./scrapers/docs-page.js";
import { scrapeStatusPage } from "./scrapers/status-page.js";
import { generateJsonFeed } from "./feed/json.js";
import { generateRssFeed } from "./feed/rss.js";
import { generateOpml } from "./feed/opml.js";
import * as log from "./log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDS_DIR = join(__dirname, "..", "public", "feeds");

const scraperMap = {
  "github-releases": scrapeGithubReleases,
  "github-changelog": scrapeGithubChangelog,
  "npm-registry": scrapeNpmRegistry,
  "blog-page": scrapeBlogPage,
  "docs-page": scrapeDocsPage,
  "status-page": scrapeStatusPage,
};

async function runWithConcurrency(tasks, limit = 4) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = task().then(
      (r) => {
        executing.delete(p);
        return r;
      },
      (err) => {
        executing.delete(p);
        throw err;
      },
    );
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing).catch(() => {});
  }
  return Promise.allSettled(results);
}

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function main() {
  const runStart = Date.now();
  const state = await loadState();

  log.info("Starting anthropic-watch");

  const trackedCount = Object.keys(state).length;
  log.info(`Loading state (${trackedCount} sources tracked)`);
  log.info(`Running ${sources.length} scrapers...`);
  log.separator();

  // Build scraper tasks
  const tasks = sources.map((source) => () => {
    const scraper = scraperMap[source.scraperType];
    if (!scraper)
      return Promise.reject(new Error(`No scraper for ${source.scraperType}`));
    const startTime = Date.now();
    return scraper(source).then(
      (items) => ({
        source,
        items,
        durationMs: Date.now() - startTime,
        error: null,
      }),
      (err) => {
        throw Object.assign(err, {
          _source: source,
          _durationMs: Date.now() - startTime,
        });
      },
    );
  });

  const settled = await runWithConcurrency(tasks, 4);

  // Process results
  let allNewItems = [];
  const sourceResults = [];
  let totalErrors = 0;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      const { source, items, durationMs } = result.value;
      recordSuccess(state, source.key);
      const newItems = items.filter((item) =>
        isNew(state, source.key, item.id),
      );
      if (items.length > 0) markSeen(state, source.key, items);

      log.ok(source.key, newItems.length, durationMs);

      allNewItems.push(...newItems);
      sourceResults.push({
        key: source.key,
        name: source.name,
        category: source.category,
        status: "ok",
        newItemCount: newItems.length,
        items: newItems,
        durationMs,
        error: null,
      });
    } else {
      const err = result.reason;
      const source = err._source || {
        key: "unknown",
        name: "unknown",
        category: "unknown",
      };
      const durationMs = err._durationMs || 0;
      recordFailure(state, source.key);
      totalErrors++;

      log.fail(source.key, durationMs, err.message);

      sourceResults.push({
        key: source.key,
        name: source.name,
        category: source.category,
        status: "error",
        newItemCount: 0,
        items: [],
        durationMs,
        error: err.message,
      });
    }
  }

  log.separator();

  // Summary
  const healthyCount = sourceResults.filter((r) => r.status === "ok").length;
  log.info(
    `${allNewItems.length} new items, ${totalErrors} errors, ${healthyCount}/${sources.length} healthy`,
  );

  // Warn for consecutive failures
  for (const src of sourceResults) {
    const failures = state[src.key]?.consecutiveFailures || 0;
    if (failures >= 3) {
      log.warn(`${src.key} has failed ${failures} consecutive times`);
    }
  }

  // Generate feeds with accumulation
  await mkdir(FEEDS_DIR, { recursive: true });

  // Read existing feeds for accumulation
  const existingAll = await readJsonSafe(join(FEEDS_DIR, "all.json"));
  const existingAllItems = existingAll?.items || [];

  await writeFile(
    join(FEEDS_DIR, "all.json"),
    generateJsonFeed(
      allNewItems,
      {
        title: "anthropic-watch \u2014 all sources",
        maxItems: 100,
      },
      existingAllItems,
    ),
  );
  await writeFile(
    join(FEEDS_DIR, "all.xml"),
    generateRssFeed(
      allNewItems,
      {
        title: "anthropic-watch \u2014 all sources",
        maxItems: 100,
      },
      existingAllItems,
    ),
  );

  // Per-source feeds
  const sourceGroups = {};
  for (const item of allNewItems) {
    if (!sourceGroups[item.source]) sourceGroups[item.source] = [];
    sourceGroups[item.source].push(item);
  }

  for (const source of sources) {
    const newItems = sourceGroups[source.key] || [];
    const existingSource = await readJsonSafe(
      join(FEEDS_DIR, `${source.key}.json`),
    );
    const existingSourceItems = existingSource?.items || [];
    const meta = {
      title: `anthropic-watch \u2014 ${source.name}`,
      maxItems: 50,
    };
    await writeFile(
      join(FEEDS_DIR, `${source.key}.json`),
      generateJsonFeed(newItems, meta, existingSourceItems),
    );
    await writeFile(
      join(FEEDS_DIR, `${source.key}.xml`),
      generateRssFeed(newItems, meta, existingSourceItems),
    );
  }

  // OPML
  await writeFile(join(FEEDS_DIR, "sources.opml"), generateOpml());

  // Run report
  const runDuration = Date.now() - runStart;
  const runReport = {
    version: "1.0",
    runId: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    duration_ms: runDuration,
    summary: {
      totalNewItems: allNewItems.length,
      sourcesChecked: sources.length,
      sourcesWithErrors: totalErrors,
      healthySources: healthyCount,
    },
    sources: sourceResults.map(({ items, ...rest }) => rest),
  };
  await writeFile(
    join(FEEDS_DIR, "run-report.json"),
    JSON.stringify(runReport, null, 2),
  );

  // Run history
  const historyPath = join(FEEDS_DIR, "run-history.json");
  const existingHistory = (await readJsonSafe(historyPath)) || [];
  const historyEntry = {
    timestamp: runReport.timestamp,
    durationMs: runDuration,
    totalNewItems: allNewItems.length,
    sourcesChecked: sources.length,
    sourcesWithErrors: totalErrors,
    errors: sourceResults
      .filter((r) => r.status === "error")
      .map((r) => ({ key: r.key, error: r.error })),
  };
  existingHistory.unshift(historyEntry);
  await writeFile(
    historyPath,
    JSON.stringify(existingHistory.slice(0, 30), null, 2),
  );

  // Save state
  await saveState(state);

  // Set GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `has_new_items=${allNewItems.length > 0}\n`,
    );
  }

  log.info(`Done in ${(runDuration / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
