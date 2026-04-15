import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

async function fetchHtml(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent":
        "anthropic-watch/0.1 (https://github.com/anthropics/anthropic-watch)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseFlexibleDate(str) {
  if (!str) return new Date().toISOString();
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseIntercomArticle(html, source) {
  const $ = cheerio.load(html);
  const container =
    $(".article_body").first().length > 0
      ? $(".article_body").first()
      : $(".intercom-article-body").first().length > 0
        ? $(".intercom-article-body").first()
        : $("article").first();

  if (container.length === 0) return [];

  const items = [];
  const baseUrl = source.url.replace(/#.*$/, "");

  container.find("h3").each((_i, h3El) => {
    const $h3 = $(h3El);
    const dateText = $h3.text().trim();
    if (!dateText) return;

    // Collect sibling elements until next h2 or h3
    const siblings = [];
    let next = $h3.next();
    while (next.length > 0 && !next.is("h2") && !next.is("h3")) {
      siblings.push(next);
      next = next.next();
    }

    // First bold text = title, fallback to date text
    let title = "";
    for (const $sib of siblings) {
      const bold = $sib.find("b, strong").first().text().trim();
      if (bold) {
        title = bold;
        break;
      }
    }
    if (!title) title = dateText;

    // Remaining p text = snippet
    const snippetParts = [];
    for (const $sib of siblings) {
      if ($sib.is("p")) {
        snippetParts.push($sib.text().trim());
      }
    }
    const snippet = snippetParts.join(" ").slice(0, 300);

    const anchor = $h3.attr("id") || "";
    const itemUrl = anchor ? `${baseUrl}#${anchor}` : baseUrl;

    items.push({
      id: itemUrl,
      title,
      date: parseFlexibleDate(dateText),
      url: itemUrl,
      snippet,
      source: source.key,
    });
  });

  return items.slice(0, 20);
}

function parseDocsHash(html, source) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("nav, footer, script, style, header").remove();

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const hash = createHash("sha256").update(bodyText).digest("hex").slice(0, 12);

  const title = $("h1").first().text().trim() || "Docs Page Update";

  // Extract snippet from first table or first paragraph
  const tableText = $("table").first().text().trim();
  const snippet = (tableText || $("p").first().text().trim() || "").slice(
    0,
    300,
  );

  return [
    {
      id: hash,
      title,
      date: new Date().toISOString(),
      url: source.url,
      snippet,
      source: source.key,
    },
  ];
}

export async function scrapeDocsPage(source) {
  try {
    const html = await fetchHtml(source.url);
    let items;
    switch (source.parseMode) {
      case "intercom-article":
        items = parseIntercomArticle(html, source);
        break;
      case "docs-hash":
        items = parseDocsHash(html, source);
        break;
      default:
        console.warn(
          `[docs-page] ${source.key}: unknown parseMode "${source.parseMode}"`,
        );
        return [];
    }
    if (items.length === 0)
      console.warn(`[docs-page] ${source.key}: no items found`);
    return items;
  } catch (err) {
    console.error(`[docs-page] ${source.key}: ${err.message}`);
    return [];
  }
}
