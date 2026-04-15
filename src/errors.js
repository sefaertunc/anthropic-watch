export class ScraperError extends Error {
  constructor(sourceKey, message, cause) {
    super(`[${sourceKey}] ${message}`);
    this.sourceKey = sourceKey;
    this.cause = cause;
  }
}
