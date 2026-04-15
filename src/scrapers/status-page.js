export async function scrapeStatusPage(source) {
  try {
    const origin = new URL(source.url).origin;
    const apiUrl = `${origin}/api/v2/incidents.json`;

    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "anthropic-watch/0.1 (https://github.com/anthropics/anthropic-watch)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${apiUrl}`);

    const data = await res.json();
    const incidents = data.incidents || [];

    return incidents.slice(0, 20).map((inc) => {
      const latestUpdate = inc.incident_updates?.[0];
      const status = inc.status || "unknown";
      const impact = inc.impact || "none";
      const body = (latestUpdate?.body || "").slice(0, 300);
      const snippet = `[${impact}] ${status} — ${body}`.slice(0, 300);

      return {
        id: inc.id,
        title: inc.name,
        date: inc.created_at || new Date().toISOString(),
        url: inc.shortlink || source.url,
        snippet,
        source: source.key,
      };
    });
  } catch (err) {
    console.error(`[status-page] ${source.key}: ${err.message}`);
    return [];
  }
}
