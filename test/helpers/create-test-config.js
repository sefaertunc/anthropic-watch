import { join } from "node:path";
import { sources } from "../../src/sources.js";

const jsonScrapers = new Set([
  "github-releases",
  "github-changelog",
  "npm-registry",
  "status-page",
]);

export function createTestConfigs(fixturesDir) {
  return sources.map((source) => {
    const ext = jsonScrapers.has(source.scraperType) ? ".json" : ".html";
    const config = {
      ...source,
      fixtureFile: join(fixturesDir, `${source.key}${ext}`),
    };
    if (source.scraperType === "npm-registry") {
      config.fixtureFileFull = join(fixturesDir, `${source.key}-full.json`);
    }
    return config;
  });
}

export function createSingleTestConfig(sourceKey, fixturePath) {
  const source = sources.find((s) => s.key === sourceKey);
  if (!source) throw new Error(`Unknown source key: ${sourceKey}`);
  return { ...source, fixtureFile: fixturePath };
}
