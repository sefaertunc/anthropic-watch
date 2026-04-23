import { describe, it, expect } from "vitest";
import {
  AnthropicWatchError,
  FeedVersionMismatchError,
  FeedFetchError,
  FeedMalformedError,
} from "../src/errors.js";

describe("error hierarchy", () => {
  it("every subclass is instanceof AnthropicWatchError", () => {
    expect(new FeedVersionMismatchError("2.0")).toBeInstanceOf(
      AnthropicWatchError,
    );
    expect(new FeedFetchError("boom")).toBeInstanceOf(AnthropicWatchError);
    expect(new FeedMalformedError("boom")).toBeInstanceOf(AnthropicWatchError);
  });

  it("every subclass sets the correct .name", () => {
    expect(new AnthropicWatchError("x").name).toBe("AnthropicWatchError");
    expect(new FeedVersionMismatchError("2.0").name).toBe(
      "FeedVersionMismatchError",
    );
    expect(new FeedFetchError("x").name).toBe("FeedFetchError");
    expect(new FeedMalformedError("x").name).toBe("FeedMalformedError");
  });
});

describe("FeedVersionMismatchError", () => {
  it("carries actualVersion and expectedVersion", () => {
    const err = new FeedVersionMismatchError("2.0");
    expect(err.actualVersion).toBe("2.0");
    expect(err.expectedVersion).toBe("1.0");
  });

  it("accepts a non-default expectedVersion", () => {
    const err = new FeedVersionMismatchError("3.0", "2.0");
    expect(err.expectedVersion).toBe("2.0");
  });

  it("includes both versions in the message", () => {
    const err = new FeedVersionMismatchError("2.0");
    expect(err.message).toContain("1.0");
    expect(err.message).toContain("2.0");
  });
});

describe("FeedFetchError", () => {
  it("carries url and status", () => {
    const err = new FeedFetchError("HTTP 500", {
      url: "https://x/feed",
      status: 500,
    });
    expect(err.url).toBe("https://x/feed");
    expect(err.status).toBe(500);
  });

  it("status is null when not provided (non-HTTP failure)", () => {
    const err = new FeedFetchError("DNS failure", { url: "https://x/feed" });
    expect(err.status).toBeNull();
  });

  it("preserves cause for ES2022 cause chaining", () => {
    const underlying = new TypeError("bad fetch");
    const err = new FeedFetchError("wrapping", {
      url: "https://x/feed",
      cause: underlying,
    });
    expect(err.cause).toBe(underlying);
    expect(err.cause).toBeInstanceOf(TypeError);
  });
});

describe("FeedMalformedError", () => {
  it("carries url and reason", () => {
    const err = new FeedMalformedError("shape unexpected", {
      url: "https://x/feed",
      reason: "feed.items is not an array",
    });
    expect(err.url).toBe("https://x/feed");
    expect(err.reason).toBe("feed.items is not an array");
  });
});
