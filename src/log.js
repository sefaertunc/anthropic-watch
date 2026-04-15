const ts = () => new Date().toISOString().slice(11, 19);

export function info(msg) {
  console.log(`[${ts()}] ${msg}`);
}

export function ok(key, count, ms) {
  console.log(
    `[${ts()}] \u2713 ${key.padEnd(28)} ${count} new items (${ms}ms)`,
  );
}

export function fail(key, ms, msg) {
  console.log(`[${ts()}] \u2717 ${key.padEnd(28)} error: ${msg} (${ms}ms)`);
}

export function warn(msg) {
  console.log(`[${ts()}] \u26a0 ${msg}`);
}

export function separator() {
  console.log(`[${ts()}] ${"─".repeat(50)}`);
}
