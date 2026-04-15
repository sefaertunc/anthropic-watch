import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadState,
  saveState,
  isNew,
  markSeen,
  recordSuccess,
  recordFailure,
} from "../../src/state.js";

describe("state", () => {
  let tmpDir;
  let statePath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "aw-test-"));
    statePath = join(tmpDir, "state.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loadState returns {} when file missing", async () => {
    const state = await loadState(statePath);
    expect(state).toEqual({});
  });

  it("loadState parses valid JSON", async () => {
    const data = {
      "test-source": {
        knownIds: ["a"],
        lastChecked: "2026-01-01T00:00:00.000Z",
      },
    };
    await saveState(data, statePath);
    const state = await loadState(statePath);
    expect(state["test-source"].knownIds).toEqual(["a"]);
  });

  it("saveState creates directory and writes valid JSON", async () => {
    const nestedPath = join(tmpDir, "nested", "dir", "state.json");
    await saveState({ foo: "bar" }, nestedPath);
    const loaded = await loadState(nestedPath);
    expect(loaded.foo).toBe("bar");
  });

  it("isNew returns true for unseen items", () => {
    const state = { src: { knownIds: ["a", "b"] } };
    expect(isNew(state, "src", "c")).toBe(true);
  });

  it("isNew returns false for seen items", () => {
    const state = { src: { knownIds: ["a", "b"] } };
    expect(isNew(state, "src", "a")).toBe(false);
  });

  it("isNew returns true when source has no state", () => {
    expect(isNew({}, "unknown", "x")).toBe(true);
  });

  it("markSeen preserves existing IDs and updates lastChecked", () => {
    const state = { src: { knownIds: ["a"], lastChecked: null } };
    markSeen(state, "src", [{ id: "b" }, { id: "c" }]);
    expect(state.src.knownIds).toEqual(["a", "b", "c"]);
    expect(state.src.lastChecked).toBeTruthy();
  });

  it("markSeen does not duplicate IDs", () => {
    const state = { src: { knownIds: ["a"], lastChecked: null } };
    markSeen(state, "src", [{ id: "a" }, { id: "b" }]);
    expect(state.src.knownIds).toEqual(["a", "b"]);
  });

  it("recordFailure increments consecutiveFailures", () => {
    const state = {};
    recordFailure(state, "src");
    expect(state.src.consecutiveFailures).toBe(1);
    recordFailure(state, "src");
    expect(state.src.consecutiveFailures).toBe(2);
  });

  it("recordSuccess resets consecutiveFailures and updates lastSuccess", () => {
    const state = {
      src: { knownIds: [], lastChecked: null, consecutiveFailures: 5 },
    };
    recordSuccess(state, "src");
    expect(state.src.consecutiveFailures).toBe(0);
    expect(state.src.lastSuccess).toBeTruthy();
  });
});
