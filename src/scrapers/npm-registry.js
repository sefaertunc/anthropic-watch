export async function scrapeNpmRegistry(source) {
  try {
    const pkgName = source.packageName;

    // Fetch latest version info
    const latestRes = await fetch(
      `https://registry.npmjs.org/${pkgName}/latest`,
    );
    if (!latestRes.ok) {
      console.error(`[npm-registry] ${source.key}: HTTP ${latestRes.status}`);
      return [];
    }
    const latest = await latestRes.json();
    const version = latest.version;
    const description = latest.description || "";

    // Fetch full package doc for publish date
    let publishDate = new Date().toISOString();
    try {
      const fullRes = await fetch(`https://registry.npmjs.org/${pkgName}`);
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
  } catch (err) {
    console.error(`[npm-registry] ${source.key}: ${err.message}`);
    return [];
  }
}
