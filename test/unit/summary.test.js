import { describe, it, expect } from "vitest";
import { generateSummary } from "../../src/summary.js";

function sampleReport(overrides = {}) {
  return {
    version: "1.0",
    runId: "2026-04-16T06:00:00.000Z",
    timestamp: "2026-04-16T06:00:00.000Z",
    duration_ms: 12345,
    summary: {
      totalNewItems: 3,
      sourcesChecked: 3,
      sourcesWithErrors: 1,
      healthySources: 2,
      ...overrides.summary,
    },
    sources: overrides.sources || [
      {
        key: "claude-code-releases",
        name: "Claude Code Releases",
        category: "core",
        status: "ok",
        newItemCount: 2,
        durationMs: 400,
        error: null,
      },
      {
        key: "blog-news",
        name: "Anthropic News Blog",
        category: "core",
        status: "ok",
        newItemCount: 1,
        durationMs: 300,
        error: null,
      },
      {
        key: "status-page",
        name: "Anthropic Status Page",
        category: "extended",
        status: "error",
        newItemCount: 0,
        durationMs: 15000,
        error:
          "HTTP 503 for https://status.anthropic.com/api/v2/incidents.json",
      },
    ],
  };
}

describe("generateSummary", () => {
  it("emits the summary header", () => {
    const out = generateSummary(sampleReport(), {});
    expect(out).toContain("## Anthropic Watch");
    expect(out).toContain("Run Summary");
  });

  it("emits a markdown table with header + divider", () => {
    const out = generateSummary(sampleReport(), {});
    expect(out).toContain("| Source | Status | New Items |");
    expect(out).toContain("|--------|--------|-----------|");
  });

  it("uses status markers for ok vs error sources", () => {
    const out = generateSummary(sampleReport(), {});
    // ok rows get the check mark + count
    expect(out).toMatch(/\| claude-code-releases \| \u2705 \| 2 \|/);
    expect(out).toMatch(/\| blog-news \| \u2705 \| 1 \|/);
    // error rows get the cross mark + "error" cell
    expect(out).toMatch(/\| status-page \| \u274c \| error \|/);
  });

  it("includes the totals line with item count, source count, error count", () => {
    const out = generateSummary(sampleReport(), {});
    expect(out).toContain(
      "**Total: 3 new items across 2 sources. 1 error(s).**",
    );
  });

  it("emits no ::warning lines when no source has >= 3 consecutive failures", () => {
    const out = generateSummary(sampleReport(), {
      "claude-code-releases": { consecutiveFailures: 0 },
      "status-page": { consecutiveFailures: 2 },
    });
    expect(out).not.toContain("::warning");
  });

  it("emits a ::warning annotation for each source at >= 3 consecutive failures", () => {
    const out = generateSummary(sampleReport(), {
      "status-page": { consecutiveFailures: 5 },
      "blog-news": { consecutiveFailures: 4 },
    });
    expect(out).toContain(
      "::warning title=Scraper failing: Anthropic Status Page::status-page has failed 5 consecutive times",
    );
    expect(out).toContain(
      "::warning title=Scraper failing: Anthropic News Blog::blog-news has failed 4 consecutive times",
    );
  });

  it("tolerates missing state (defaults to empty object)", () => {
    const out = generateSummary(sampleReport());
    expect(out).toContain("## Anthropic Watch");
    expect(out).not.toContain("::warning");
  });

  it("emits one table row per source", () => {
    const report = sampleReport();
    const out = generateSummary(report, {});
    const rowMatches = out.match(/^\| [a-z-]+ \| /gm) || [];
    expect(rowMatches.length).toBe(report.sources.length);
  });
});
