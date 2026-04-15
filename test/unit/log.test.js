import { describe, it, expect, vi, afterEach } from "vitest";
import * as log from "../../src/log.js";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info outputs timestamped message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/\[\d{2}:\d{2}:\d{2}\] test message/);
  });

  it("ok outputs key, count, and duration", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.ok("test-source", 5, 123);
    const output = spy.mock.calls[0][0];
    expect(output).toContain("test-source");
    expect(output).toContain("5 new items");
    expect(output).toContain("123ms");
  });

  it("fail outputs key, error, and duration", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.fail("test-source", 456, "connection failed");
    const output = spy.mock.calls[0][0];
    expect(output).toContain("test-source");
    expect(output).toContain("connection failed");
    expect(output).toContain("456ms");
  });

  it("warn outputs warning message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.warn("rate limit low");
    expect(spy.mock.calls[0][0]).toContain("rate limit low");
  });

  it("separator outputs a line", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.separator();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("─");
  });
});
