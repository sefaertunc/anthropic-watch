import { fetchSource } from "../fetch-source.js";

export async function scrapeStatusPage(source) {
  const origin = new URL(source.url).origin;
  const apiUrl = `${origin}/api/v2/incidents.json`;

  const res = await fetchSource(
    apiUrl,
    { redirect: "follow" },
    source.fixtureFile,
  );
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
      sourceCategory: source.category,
      sourceName: source.name,
    };
  });
}
