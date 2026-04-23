import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function extractProgrammaticConsumptionExample() {
  const schemaDoc = readFileSync(
    resolve(REPO_ROOT, "docs/FEED-SCHEMA.md"),
    "utf8",
  );
  // Anchor on the exact section heading so a stray ```js fence elsewhere in the
  // doc cannot satisfy this match. Section heading is "## Programmatic Consumption"
  // at the time of writing.
  const SECTION_RE =
    /(^|\n)## Programmatic Consumption\s*\n[\s\S]*?\n```js\n([\s\S]*?)\n```/;
  const sectionMatch = schemaDoc.match(SECTION_RE);
  if (!sectionMatch) {
    throw new Error(
      "Could not find Programmatic Consumption JS example in docs/FEED-SCHEMA.md. " +
        "Has the section heading or fence language changed?",
    );
  }
  return sectionMatch[2];
}

describe("docs/FEED-SCHEMA.md Programmatic Consumption example", () => {
  it("runs against the valid fixture without error and dedupes correctly across two runs", async () => {
    const exampleSource = extractProgrammaticConsumptionExample();
    const fixture = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, "packages/client/fixtures/all.valid.json"),
        "utf8",
      ),
    );

    // The canonical example MUST export a top-level `async function run(seenSet)`.
    // The wrapper concatenates the example source with `export { run };` — if the
    // example doesn't declare `run` at top level, import fails at module-load time
    // and this test fails loudly.
    const tmpFile = join(
      mkdtempSync(join(tmpdir(), "aw-docs-example-")),
      "ex.mjs",
    );
    const wrapped = `
globalThis.__mockFeed = ${JSON.stringify(fixture)};
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => globalThis.__mockFeed,
});
${exampleSource}
export { run };
`;
    writeFileSync(tmpFile, wrapped);

    const mod = await import(pathToFileURL(tmpFile).href);
    expect(typeof mod.run).toBe("function");

    const seen = new Set();

    const firstFresh = await mod.run(seen);
    expect(Array.isArray(firstFresh)).toBe(true);
    expect(firstFresh.length).toBeGreaterThan(0);
    for (const item of firstFresh) {
      expect(typeof item.uniqueKey).toBe("string");
      expect(item.uniqueKey.length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(firstFresh.length);

    // Second run against the SAME seen-set and SAME mocked feed — no new items
    // have arrived, so fresh must be empty.
    const secondFresh = await mod.run(seen);
    expect(secondFresh.length).toBe(0);
    expect(seen.size).toBe(firstFresh.length);
  });
});
