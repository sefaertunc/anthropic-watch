import { createHash } from "node:crypto";
import { fetchSource } from "../fetch-source.js";
import { logGitHubRateLimit } from "../fetch-with-retry.js";
import { githubHeaders } from "../github-auth.js";

function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 300);
}

export async function scrapeGithubChangelog(source) {
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.file}`;
  const res = await fetchSource(
    url,
    { headers: githubHeaders() },
    source.fixtureFile,
  );
  if (!source.fixtureFile) logGitHubRateLimit(res);

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  // Extract topmost entry: content between first and second ## heading
  const headingRegex = /^## .+$/gm;
  const firstMatch = headingRegex.exec(content);

  let id, title, entryContent;
  if (firstMatch) {
    const secondMatch = headingRegex.exec(content);
    const entryEnd = secondMatch ? secondMatch.index : content.length;
    entryContent = content
      .slice(firstMatch.index + firstMatch[0].length, entryEnd)
      .trim();
    title = firstMatch[0].replace(/^## /, "").trim();
    id = title;
  } else {
    // Fallback: no ## heading found. Hash the full file for a stable id, and
    // synthesize a title from the first 40 chars of stripped content so the
    // feed still has something readable.
    id = createHash("sha256").update(content).digest("hex").slice(0, 12);
    const stripped = content.replace(/\s+/g, " ").trim().slice(0, 40);
    title = `(no heading — ${stripped})`;
    entryContent = content.trim();
  }

  return [
    {
      id,
      title,
      date: new Date().toISOString(),
      url: source.url,
      snippet: stripMarkdown(entryContent),
      source: source.key,
      sourceCategory: source.category,
      sourceName: source.name,
    },
  ];
}
