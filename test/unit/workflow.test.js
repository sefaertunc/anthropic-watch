import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "scrape.yml",
);

describe("scrape.yml workflow", () => {
  let workflow;

  it("is valid YAML", async () => {
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    expect(workflow).toBeTruthy();
  });

  it("has cron schedule 0 6 * * *", async () => {
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    const cron = workflow.on.schedule[0].cron;
    expect(cron).toBe("0 6 * * *");
  });

  it("has workflow_dispatch trigger", async () => {
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    expect(workflow.on.workflow_dispatch).toBeDefined();
  });

  it("has required permissions", async () => {
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    expect(workflow.permissions.contents).toBe("write");
    expect(workflow.permissions.pages).toBe("write");
  });

  it("uses GITHUB_TOKEN", async () => {
    const content = await readFile(workflowPath, "utf-8");
    expect(content).toContain("GITHUB_TOKEN");
  });

  it("has if: always() on summary step", async () => {
    const content = await readFile(workflowPath, "utf-8");
    expect(content).toContain("if: always()");
  });

  it("has no in-workflow test job (tests run in test.yml)", async () => {
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    expect(workflow.jobs.test).toBeUndefined();
    expect(workflow.jobs.scrape.needs).toBeUndefined();
  });

  it("commit-state step resyncs to origin/main on push failure (v1.4.1 rebase-abort fix)", async () => {
    const content = await readFile(workflowPath, "utf-8");
    // The v1.4.1 retry loop abandons pull --rebase (which bricked on conflicts
    // per the v1.4.0 bug) for a hard-reset + re-apply pattern. See
    // v1.4.1-ops-diagnostic.md Issue 1 and scripts/verify-rebase-retry-*.sh.
    expect(content).toMatch(/git reset --hard\s+-?q?\s*origin\/main/);
    expect(content).toMatch(/git rebase --abort/);
  });

  it("commit-state step is guarded to main branch only (v1.4.1 preflight-safety fix)", async () => {
    const content = await readFile(workflowPath, "utf-8");
    // Without this guard, workflow_dispatch on any branch pushes to main and
    // deploys to gh-pages — hazardous for preflight testing from develop.
    expect(content).toMatch(
      /Commit state changes[\s\S]{0,200}if:\s*github\.ref\s*==\s*'refs\/heads\/main'/,
    );
    expect(content).toMatch(
      /Deploy to GitHub Pages[\s\S]{0,200}if:\s*github\.ref\s*==\s*'refs\/heads\/main'/,
    );
  });

  it("hydrates gh-pages feeds before running scraper", async () => {
    // public/feeds/ lives on gh-pages, not main. Without hydration,
    // readJsonSafe returns null on a fresh CI checkout and the rolling-window
    // merge silently truncates each run to "today's new items only."
    const content = await readFile(workflowPath, "utf-8");
    workflow = parse(content);
    const steps = workflow.jobs.scrape.steps;
    const hydrateIdx = steps.findIndex(
      (s) =>
        s.uses?.startsWith("actions/checkout") && s.with?.ref === "gh-pages",
    );
    const scraperIdx = steps.findIndex((s) => s.name === "Run scraper");
    expect(hydrateIdx).toBeGreaterThanOrEqual(0);
    expect(hydrateIdx).toBeLessThan(scraperIdx);
  });
});
