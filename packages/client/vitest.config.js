import { defineConfig } from "vitest/config";

// Local vitest config exists solely to anchor vitest's config-discovery walk
// to the packages/client/ root. Without it, `vitest run` invoked from this
// directory walks up the tree, loads the repo-root vitest.config.js, and
// tries to import `vitest/config` from a node_modules that is not installed
// in CI (the Publish Client workflow only runs `npm ci` inside
// packages/client/). See .github/workflows/publish-client.yml.
//
// Default vitest behavior is what the client wants — file discovery picks
// up test/**/*.test.js without further configuration.
export default defineConfig({
  test: {},
});
