import { fetchWithRetry, logGitHubRateLimit } from "../fetch-with-retry.js";

function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/[#*_`]/g, "") // remove markdown chars
    .replace(/\n{2,}/g, "\n") // collapse blank lines
    .trim()
    .slice(0, 300);
}

export async function scrapeGithubReleases(source) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/releases?per_page=10`;
  const res = await fetchWithRetry(url, { headers });
  logGitHubRateLimit(res);

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const releases = await res.json();

  return releases.map((r) => ({
    id: r.tag_name,
    title: r.name || r.tag_name,
    date: r.published_at,
    url: r.html_url,
    snippet: stripMarkdown(r.body),
    source: source.key,
  }));
}
