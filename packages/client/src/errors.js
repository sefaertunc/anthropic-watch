export class AnthropicWatchError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "AnthropicWatchError";
    if (options.cause) this.cause = options.cause;
  }
}

export class FeedVersionMismatchError extends AnthropicWatchError {
  /**
   * @param {string} actualVersion
   * @param {string} [expectedVersion]
   */
  constructor(actualVersion, expectedVersion = "1.0") {
    super(
      `Feed version mismatch: expected "${expectedVersion}", got "${actualVersion}"`,
    );
    this.name = "FeedVersionMismatchError";
    this.actualVersion = actualVersion;
    this.expectedVersion = expectedVersion;
  }
}

export class FeedFetchError extends AnthropicWatchError {
  /**
   * @param {string} message
   * @param {{ url?: string, status?: number | null, cause?: unknown }} [options]
   */
  constructor(message, { url, status, cause } = {}) {
    super(message, { cause });
    this.name = "FeedFetchError";
    this.url = url;
    /** @type {number | null} */
    this.status = status ?? null;
  }
}

export class FeedMalformedError extends AnthropicWatchError {
  /**
   * @param {string} message
   * @param {{ url?: string, reason?: string }} [options]
   */
  constructor(message, { url, reason } = {}) {
    super(message);
    this.name = "FeedMalformedError";
    this.url = url;
    this.reason = reason;
  }
}
