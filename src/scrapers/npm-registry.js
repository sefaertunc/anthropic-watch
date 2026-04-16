import { fetchSource } from "../fetch-source.js";

export async function scrapeNpmRegistry(source) {
  const pkgName = source.packageName;

  // Fetch latest version info
  const latestRes = await fetchSource(
    `https://registry.npmjs.org/${pkgName}/latest`,
    {},
    source.fixtureFile,
  );
  if (!latestRes.ok)
    throw new Error(`HTTP ${latestRes.status} for ${pkgName}/latest`);
  const latest = await latestRes.json();
  const version = latest.version;
  const description = latest.description || "";

  // Fetch full package doc for publish date
  let publishDate = new Date().toISOString();
  try {
    const fullRes = await fetchSource(
      `https://registry.npmjs.org/${pkgName}`,
      {},
      source.fixtureFileFull,
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
      snippet: (description || "").trim().slice(0, 300),
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    },
  ];
}
