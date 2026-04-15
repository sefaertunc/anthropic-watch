/**
 * Fixture capture script for anthropic-watch.
 *
 * Fetches real responses from all 16 sources and saves them as fixture files
 * under test/fixtures/. Accepts an optional [source-key] CLI argument to
 * capture just one source.
 *
 * Usage:
 *   node test/capture-fixtures.js                # capture all sources
 *   node test/capture-fixtures.js status-page    # capture one source
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { sources } from "../src/sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

const UA = "anthropic-watch/0.4 (fixture-capture)";

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function minimizeHtml(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  $("img").attr("src", "#");
  return $.html();
}

function ghHeaders() {
  const h = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Per-scraper capture functions
// Each returns an array of { filename, data } objects.
// ---------------------------------------------------------------------------

async function captureGithubReleases(source) {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/releases?per_page=10`;
  console.log(`  GET ${url}`);
  const releases = await fetchJson(url, ghHeaders());
  const trimmed = releases.slice(0, 5);
  return [
    { filename: `${source.key}.json`, data: JSON.stringify(trimmed, null, 2) },
  ];
}

async function captureGithubChangelog(source) {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.file}`;
  console.log(`  GET ${url}`);
  const json = await fetchJson(url, ghHeaders());
  return [
    { filename: `${source.key}.json`, data: JSON.stringify(json, null, 2) },
  ];
}

async function captureNpmRegistry(source) {
  const latestUrl = `https://registry.npmjs.org/${source.packageName}/latest`;
  const fullUrl = `https://registry.npmjs.org/${source.packageName}`;

  console.log(`  GET ${latestUrl}`);
  const latest = await fetchJson(latestUrl);

  console.log(`  GET ${fullUrl}`);
  const full = await fetchJson(fullUrl);

  // Trim the full document: keep only essential fields
  const latestVersion = full["dist-tags"]?.latest;
  const trimmedFull = {
    name: full.name,
    description: full.description,
    "dist-tags": full["dist-tags"],
    time: full.time,
    versions: {},
  };
  if (latestVersion && full.versions?.[latestVersion]) {
    trimmedFull.versions[latestVersion] = full.versions[latestVersion];
  }

  return [
    { filename: `${source.key}.json`, data: JSON.stringify(latest, null, 2) },
    {
      filename: `${source.key}-full.json`,
      data: JSON.stringify(trimmedFull, null, 2),
    },
  ];
}

async function captureBlogPage(source) {
  console.log(`  GET ${source.url}`);
  const html = await fetchHtml(source.url);
  const minimized = minimizeHtml(html);
  return [{ filename: `${source.key}.html`, data: minimized }];
}

async function captureDocsPage(source) {
  console.log(`  GET ${source.url}`);
  const html = await fetchHtml(source.url);
  const minimized = minimizeHtml(html);
  return [{ filename: `${source.key}.html`, data: minimized }];
}

async function captureStatusPage(source) {
  const origin = new URL(source.url).origin;
  const url = `${origin}/api/v2/incidents.json`;
  console.log(`  GET ${url}`);
  const json = await fetchJson(url);
  return [
    { filename: `${source.key}.json`, data: JSON.stringify(json, null, 2) },
  ];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function captureSource(source) {
  switch (source.scraperType) {
    case "github-releases":
      return captureGithubReleases(source);
    case "github-changelog":
      return captureGithubChangelog(source);
    case "npm-registry":
      return captureNpmRegistry(source);
    case "blog-page":
      return captureBlogPage(source);
    case "docs-page":
      return captureDocsPage(source);
    case "status-page":
      return captureStatusPage(source);
    default:
      throw new Error(`Unknown scraperType: ${source.scraperType}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filterKey = process.argv[2];

  let targetSources = sources;
  if (filterKey) {
    targetSources = sources.filter((s) => s.key === filterKey);
    if (targetSources.length === 0) {
      console.error(`Unknown source key: "${filterKey}"`);
      console.error(`Available keys: ${sources.map((s) => s.key).join(", ")}`);
      process.exit(1);
    }
  }

  await mkdir(FIXTURES_DIR, { recursive: true });

  const results = []; // { file, size, status }

  for (const source of targetSources) {
    console.log(`\n[${source.key}] ${source.name}`);
    try {
      const files = await captureSource(source);

      for (const { filename, data } of files) {
        const filePath = join(FIXTURES_DIR, filename);
        await writeFile(filePath, data, "utf-8");
        const { size } = await stat(filePath);
        const sizeKB = (size / 1024).toFixed(1);
        console.log(`  -> ${filename} (${sizeKB} KB)`);
        results.push({ file: filename, size: `${sizeKB} KB`, status: "ok" });
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({
        file: `${source.key}.*`,
        size: "-",
        status: `FAILED: ${err.message}`,
      });
    }
  }

  // Summary table
  console.log("\n--- Fixture Summary ---");
  console.table(results);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
