import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  fetchWithRetry,
  logGitHubRateLimit,
} from "../../src/fetch-with-retry.js";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf-8",
  ),
);

describe("fetchWithRetry", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("succeeds on first attempt", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    const res = await fetchWithRetry("http://example.com", {}, 0);
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and succeeds on attempt 2", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });
    const res = await fetchWithRetry("http://example.com", {}, 1);
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });
    const res = await fetchWithRetry("http://example.com", {}, 2);
    expect(res.status).toBe(404);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });
    await expect(fetchWithRetry("http://example.com", {}, 1)).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("applies User-Agent header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    await fetchWithRetry("http://example.com", {}, 0);
    const calledHeaders = globalThis.fetch.mock.calls[0][1].headers;
    expect(calledHeaders["User-Agent"]).toContain("anthropic-watch");
  });

  it("User-Agent tracks package.json version (no hardcoded drift)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    await fetchWithRetry("http://example.com", {}, 0);
    const calledHeaders = globalThis.fetch.mock.calls[0][1].headers;
    expect(calledHeaders["User-Agent"]).toContain(
      `anthropic-watch/${pkg.version}`,
    );
  });

  it("retries on 429 and succeeds on attempt 2", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });
    const res = await fetchWithRetry("http://example.com", {}, 1);
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("429 with Retry-After header uses the header value for backoff", async () => {
    // Swap in a recorder setTimeout that runs callbacks on the microtask queue
    // so we can assert on the requested delay without actually waiting.
    const delays = [];
    const stub = (cb, ms) => {
      delays.push(ms);
      Promise.resolve().then(cb);
      return 0;
    };
    vi.stubGlobal("setTimeout", stub);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers([["Retry-After", "2"]]),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });

    const res = await fetchWithRetry("http://example.com", {}, 1);

    expect(res.ok).toBe(true);
    expect(delays).toContain(2000);
    // The default first-attempt backoff is 1000ms — confirm it was overridden.
    expect(delays).not.toContain(1000);

    vi.unstubAllGlobals();
  });

  it("defaults redirect: follow on the fetch options", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    await fetchWithRetry("http://example.com", {}, 0);
    const opts = globalThis.fetch.mock.calls[0][1];
    expect(opts.redirect).toBe("follow");
  });
});

describe("logGitHubRateLimit", () => {
  it("warns when remaining < 10", () => {
    const warnSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = { headers: new Headers([["x-ratelimit-remaining", "5"]]) };
    logGitHubRateLimit(res);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("rate limit"));
    warnSpy.mockRestore();
  });

  it("does not warn when remaining >= 10", () => {
    const warnSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = { headers: new Headers([["x-ratelimit-remaining", "50"]]) };
    logGitHubRateLimit(res);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
