import { fetchSource } from "../fetch-source.js";
import { logGitHubRateLimit } from "../fetch-with-retry.js";
import { githubHeaders } from "../github-auth.js";

const BOT_LOGIN_RE = /\[bot\]$/i;

function isBotAuthor(commit) {
  const login = commit.author?.login;
  if (login && BOT_LOGIN_RE.test(login)) return true;
  const name = commit.commit?.author?.name;
  if (name && BOT_LOGIN_RE.test(name)) return true;
  return false;
}

export async function scrapeGithubCommits(source) {
  const branch = source.branch ?? "main";
  const limit = source.limit ?? 10;
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/commits?per_page=${limit}&sha=${branch}`;
  const res = await fetchSource(
    url,
    { headers: githubHeaders() },
    source.fixtureFile,
  );
  if (!source.fixtureFile) logGitHubRateLimit(res);

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const commits = await res.json();

  const filtered =
    source.excludeBots !== false
      ? commits.filter((c) => !isBotAuthor(c))
      : commits;

  return filtered.map((commit) => {
    const lines = (commit.commit?.message ?? "").split("\n");
    const firstLine = lines[0].trim();
    const rest = lines.slice(1).join(" ").trim();
    const sha7 = commit.sha.substring(0, 7);
    return {
      id: sha7,
      title: firstLine ? firstLine.substring(0, 200) : sha7,
      date: commit.commit?.author?.date ?? null,
      url: commit.html_url,
      snippet: rest ? rest.slice(0, 300) : null,
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    };
  });
}
