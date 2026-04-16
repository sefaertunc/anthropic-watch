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

  it("commit-state step uses pull --rebase to avoid push races", async () => {
    const content = await readFile(workflowPath, "utf-8");
    expect(content).toMatch(/git\s+pull\s+--rebase/);
  });
});
