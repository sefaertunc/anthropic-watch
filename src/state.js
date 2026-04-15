import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, "..", "state", "last-seen.json");

export async function loadState() {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function saveState(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export function isNew(state, sourceKey, itemId) {
  const entry = state[sourceKey];
  if (!entry || !entry.knownIds) return true;
  return !entry.knownIds.includes(itemId);
}

export function markSeen(state, sourceKey, items) {
  if (!state[sourceKey]) {
    state[sourceKey] = { knownIds: [], lastChecked: null };
  }
  for (const item of items) {
    if (!state[sourceKey].knownIds.includes(item.id)) {
      state[sourceKey].knownIds.push(item.id);
    }
  }
  state[sourceKey].lastChecked = new Date().toISOString();
}

export function recordSuccess(state, sourceKey) {
  if (!state[sourceKey]) {
    state[sourceKey] = { knownIds: [], lastChecked: null };
  }
  state[sourceKey].consecutiveFailures = 0;
  state[sourceKey].lastSuccess = new Date().toISOString();
}

export function recordFailure(state, sourceKey) {
  if (!state[sourceKey]) {
    state[sourceKey] = { knownIds: [], lastChecked: null };
  }
  state[sourceKey].consecutiveFailures =
    (state[sourceKey].consecutiveFailures || 0) + 1;
}
