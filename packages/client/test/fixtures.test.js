import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function readJson(relpath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relpath), "utf8"));
}

describe("fixtures match producer canonicals", () => {
  it("packages/client/fixtures/all.valid.json equals docs/fixtures/all.sample.json", () => {
    const clientFixture = readJson("packages/client/fixtures/all.valid.json");
    const producerFixture = readJson("docs/fixtures/all.sample.json");
    assert.deepStrictEqual(clientFixture, producerFixture);
  });

  it("packages/client/fixtures/run-report.valid.json equals docs/fixtures/run-report.sample.json", () => {
    const clientFixture = readJson(
      "packages/client/fixtures/run-report.valid.json",
    );
    const producerFixture = readJson("docs/fixtures/run-report.sample.json");
    assert.deepStrictEqual(clientFixture, producerFixture);
  });
});
