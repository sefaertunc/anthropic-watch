import { fetchWithRetry } from "../fetch-with-retry.js";

export async function scrapeNpmRegistry(source) {
  const pkgName = source.packageName;

  // Fetch latest version info
  const latestRes = await fetchWithRetry(
    `https://registry.npmjs.org/${pkgName}/latest`,
  );
  if (!latestRes.ok)
    throw new Error(`HTTP ${latestRes.status} for ${pkgName}/latest`);
  const latest = await latestRes.json();
  const version = latest.version;
  const description = latest.description || "";

  // Fetch full package doc for publish date
  let publishDate = new Date().toISOString();
  try {
    const fullRes = await fetchWithRetry(
      `https://registry.npmjs.org/${pkgName}`,
    );
    if (fullRes.ok) {
      const full = await fullRes.json();
      if (full.time && full.time[version]) {
        publishDate = full.time[version];
      }
    }
  } catch {
    // fallback to current time
  }

  return [
    {
      id: version,
      title: `${pkgName}@${version}`,
      date: publishDate,
      url: source.url,
      snippet: description,
      source: source.key,
    },
  ];
}
