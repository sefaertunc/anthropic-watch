import { describe, it, expect } from "vitest";
import { parseFlexibleDate } from "../../src/parse-date.js";

describe("parseFlexibleDate", () => {
  it("parses ISO 8601", () => {
    const result = parseFlexibleDate("2026-01-15T10:30:00Z");
    expect(result).toBe("2026-01-15T10:30:00.000Z");
  });

  it("parses date-only string", () => {
    const result = parseFlexibleDate("2026-01-15");
    expect(result).toBeTruthy();
    expect(result).toContain("2026-01-15");
  });

  it("parses 'Jan 15, 2026' format", () => {
    const result = parseFlexibleDate("Jan 15, 2026");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });

  it("parses 'January 15, 2026' format", () => {
    const result = parseFlexibleDate("January 15, 2026");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });

  it("parses '15 Jan 2026' format", () => {
    const result = parseFlexibleDate("15 Jan 2026");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });

  it("returns null for empty string", () => {
    expect(parseFlexibleDate("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseFlexibleDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseFlexibleDate(undefined)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseFlexibleDate("not-a-date-at-all")).toBeNull();
  });

  it("returns null for relative dates", () => {
    // "yesterday" is technically parseable by some engines, but should be null for our purposes
    // Actually Date.parse("yesterday") returns NaN, so this returns null
    expect(parseFlexibleDate("yesterday")).toBeNull();
  });

  it("output is always ISO 8601 with Z", () => {
    const result = parseFlexibleDate("2026-06-15T12:00:00+05:00");
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});
