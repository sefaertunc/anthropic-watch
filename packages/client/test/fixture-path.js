// Shared fixture-path plumbing for test files. Resolves paths relative to
// the subpackage root and the repo root, and reads JSON fixtures.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "..");
export const REPO_ROOT = resolve(PACKAGE_DIR, "../..");

/** Read a JSON fixture from `packages/client/fixtures/`. */
export function readFixture(name) {
  return JSON.parse(
    readFileSync(resolve(PACKAGE_DIR, "fixtures", name), "utf8"),
  );
}

/** Read any JSON file by its repo-relative path. */
export function readRepoJson(relpath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relpath), "utf8"));
}

/** Read any file's text by its repo-relative path. */
export function readRepoText(relpath) {
  return readFileSync(resolve(REPO_ROOT, relpath), "utf8");
}
