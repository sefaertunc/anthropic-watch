import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, "..", "public", "feeds", "run-report.json");
const STATE_PATH = join(__dirname, "..", "state", "last-seen.json");

export function generateSummary(report, state = {}) {
  const lines = [];
  lines.push("## Anthropic Watch \u2014 Run Summary\n");
  lines.push("| Source | Status | New Items |");
  lines.push("|--------|--------|-----------|");

  for (const src of report.sources) {
    const status = src.status === "ok" ? "\u2705" : "\u274c";
    const items = src.status === "ok" ? String(src.newItemCount) : "error";
    lines.push(`| ${src.key} | ${status} | ${items} |`);
  }

  const { totalNewItems, sourcesWithErrors } = report.summary;
  const sourcesWithItems = report.sources.filter(
    (s) => s.status === "ok" && s.newItemCount > 0,
  ).length;
  lines.push("");
  lines.push(
    `**Total: ${totalNewItems} new items across ${sourcesWithItems} sources. ${sourcesWithErrors} error(s).**`,
  );
  lines.push("");

  for (const src of report.sources) {
    const entry = state[src.key];
    const failures = entry?.consecutiveFailures || 0;
    if (failures >= 3) {
      lines.push(
        `::warning title=Scraper failing: ${src.name}::${src.key} has failed ${failures} consecutive times`,
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  let report;
  try {
    report = JSON.parse(await readFile(REPORT_PATH, "utf-8"));
  } catch {
    console.log("No run report found.");
    return;
  }

  let state = {};
  try {
    state = JSON.parse(await readFile(STATE_PATH, "utf-8"));
  } catch {
    // no state file
  }

  console.log(generateSummary(report, state));
}

// Only run main() when this file is invoked directly (not when imported in tests).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error("Summary error:", err.message);
    process.exit(1);
  });
}
