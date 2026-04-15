import { mkdir, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import { sources } from "./sources.js";
import { loadState, saveState, isNew, markSeen } from "./state.js";
import { scrapeGithubReleases } from "./scrapers/github-releases.js";
import { scrapeGithubChangelog } from "./scrapers/github-changelog.js";
import { scrapeNpmRegistry } from "./scrapers/npm-registry.js";
import { scrapeBlogPage } from "./scrapers/blog-page.js";
import { scrapeDocsPage } from "./scrapers/docs-page.js";
import { scrapeStatusPage } from "./scrapers/status-page.js";
import { generateJsonFeed } from "./feed/json.js";
import { generateRssFeed } from "./feed/rss.js";

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

async function main() {
  console.log("anthropic-watch: starting scrape...\n");

  const state = await loadState();
  const implementedSources = sources.filter((s) => scraperMap[s.scraperType]);

  console.log(
    `Scraping ${implementedSources.length} sources (${sources.length - implementedSources.length} skipped — not yet implemented)\n`,
  );

  // Run scrapers in parallel
  const results = await Promise.allSettled(
    implementedSources.map(async (source) => {
      const scraper = scraperMap[source.scraperType];
      const items = await scraper(source);
      return { source, items };
    }),
  );

  let allNewItems = [];
  let totalNew = 0;
  const summary = [];

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`Scraper failed: ${result.reason}`);
      continue;
    }

    const { source, items } = result.value;
    const newItems = items.filter((item) => isNew(state, source.key, item.id));

    if (newItems.length > 0) {
      summary.push(`  ${source.key}: ${newItems.length} new`);
      allNewItems.push(...newItems);
      totalNew += newItems.length;
    }

    // Mark all fetched items as seen (not just new ones)
    if (items.length > 0) {
      markSeen(state, source.key, items);
    }
  }

  // Generate feeds
  await mkdir(FEEDS_DIR, { recursive: true });

  // Always generate all-items feeds (include all known items on first run)
  await writeFile(
    join(FEEDS_DIR, "all.json"),
    generateJsonFeed(allNewItems, { title: "anthropic-watch — all sources" }),
  );
  await writeFile(
    join(FEEDS_DIR, "all.xml"),
    generateRssFeed(allNewItems, { title: "anthropic-watch — all sources" }),
  );

  // Per-source feeds for sources with new items
  const sourceGroups = {};
  for (const item of allNewItems) {
    if (!sourceGroups[item.source]) sourceGroups[item.source] = [];
    sourceGroups[item.source].push(item);
  }

  for (const [sourceKey, items] of Object.entries(sourceGroups)) {
    const source = sources.find((s) => s.key === sourceKey);
    const meta = { title: `anthropic-watch — ${source?.name || sourceKey}` };
    await writeFile(
      join(FEEDS_DIR, `${sourceKey}.json`),
      generateJsonFeed(items, meta),
    );
    await writeFile(
      join(FEEDS_DIR, `${sourceKey}.xml`),
      generateRssFeed(items, meta),
    );
  }

  // Save state
  await saveState(state);

  // Print summary
  console.log(`\n--- Summary ---`);
  if (summary.length > 0) {
    console.log(summary.join("\n"));
    console.log(`\nTotal: ${totalNew} new items`);
  } else {
    console.log("No new items found.");
  }

  // Set GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `has_new_items=${totalNew > 0}\n`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
