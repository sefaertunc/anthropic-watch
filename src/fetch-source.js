import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./fetch-with-retry.js";

export async function fetchSource(url, options = {}, fixtureFile = null) {
  if (fixtureFile) {
    const body = await readFile(fixtureFile, "utf-8");
    const isJson = fixtureFile.endsWith(".json");
    return {
      ok: true,
      status: 200,
      headers: new Headers([
        ["content-type", isJson ? "application/json" : "text/html"],
      ]),
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  }
  return fetchWithRetry(url, options);
}
