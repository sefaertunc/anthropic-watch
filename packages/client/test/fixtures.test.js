import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readRepoJson } from "./fixture-path.js";

describe("fixtures match producer canonicals", () => {
  it("packages/client/fixtures/all.valid.json equals docs/fixtures/all.sample.json", () => {
    const clientFixture = readRepoJson(
      "packages/client/fixtures/all.valid.json",
    );
    const producerFixture = readRepoJson("docs/fixtures/all.sample.json");
    assert.deepStrictEqual(clientFixture, producerFixture);
  });

  it("packages/client/fixtures/run-report.valid.json equals docs/fixtures/run-report.sample.json", () => {
    const clientFixture = readRepoJson(
      "packages/client/fixtures/run-report.valid.json",
    );
    const producerFixture = readRepoJson(
      "docs/fixtures/run-report.sample.json",
    );
    assert.deepStrictEqual(clientFixture, producerFixture);
  });
});
