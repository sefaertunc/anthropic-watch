import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as log from "./log.js";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf-8",
  ),
);

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_UA = `anthropic-watch/${pkg.version} (https://github.com/sefaertunc/anthropic-watch)`;

export async function fetchWithRetry(url, options = {}, maxRetries = 2) {
  const headers = { "User-Agent": DEFAULT_UA, ...options.headers };
  const signal = options.signal || AbortSignal.timeout(DEFAULT_TIMEOUT);
  const opts = { ...options, headers, signal };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, opts);
      // Don't retry on 4xx or success
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      // 5xx → retry
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function logGitHubRateLimit(res) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining !== null && Number(remaining) < 10) {
    log.warn(`GitHub API rate limit low: ${remaining} remaining`);
  }
}
