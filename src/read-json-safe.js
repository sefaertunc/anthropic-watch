import { readFile } from "node:fs/promises";

export async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}
