import { createHash } from "node:crypto";

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
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.file}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.error(`[github-changelog] ${source.key}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");

    const hash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 12);

    // Extract topmost entry: content between first and second ## heading
    const headingRegex = /^## .+$/gm;
    const firstMatch = headingRegex.exec(content);
    if (!firstMatch) return [];

    const secondMatch = headingRegex.exec(content);
    const entryEnd = secondMatch ? secondMatch.index : content.length;
    const entryContent = content
      .slice(firstMatch.index + firstMatch[0].length, entryEnd)
      .trim();
    const title = firstMatch[0].replace(/^## /, "");

    return [
      {
        id: hash,
        title,
        date: new Date().toISOString(),
        url: source.url,
        snippet: stripMarkdown(entryContent),
        source: source.key,
      },
    ];
  } catch (err) {
    console.error(`[github-changelog] ${source.key}: ${err.message}`);
    return [];
  }
}
