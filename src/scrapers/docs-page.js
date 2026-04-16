import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { fetchSource } from "../fetch-source.js";
import { parseFlexibleDate } from "../parse-date.js";

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

    const siblings = [];
    let next = $h3.next();
    while (next.length > 0 && !next.is("h2") && !next.is("h3")) {
      siblings.push(next);
      next = next.next();
    }

    let title = "";
    for (const $sib of siblings) {
      const bold = $sib.find("b, strong").first().text().trim();
      if (bold) {
        title = bold;
        break;
      }
    }
    if (!title) title = dateText;

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
      sourceCategory: source.category,
      sourceName: source.name,
    });
  });

  return items.slice(0, 20);
}

function parseDocsHash(html, source) {
  const $ = cheerio.load(html);

  $("nav, footer, script, style, header").remove();

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const hash = createHash("sha256").update(bodyText).digest("hex").slice(0, 12);

  const title = $("h1").first().text().trim() || "Docs Page Update";

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
      sourceCategory: source.category,
      sourceName: source.name,
    },
  ];
}

function parseModelTable(html, source) {
  const $ = cheerio.load(html);
  const table = $("table").first();
  if (table.length === 0) {
    throw new Error("model-table: no <table> element found");
  }

  const rows = table.find("tr");
  if (rows.length < 2) {
    throw new Error("model-table: table has fewer than 2 rows");
  }

  // Header row: first cell labels the feature column, remaining cells are model display names.
  const modelNames = [];
  rows
    .eq(0)
    .find("th, td")
    .each((i, el) => {
      if (i === 0) return;
      modelNames.push($(el).text().trim());
    });

  if (modelNames.length === 0) {
    throw new Error("model-table: header row has no model columns");
  }

  // Walk feature rows; capture the row labelled "Claude API ID" for stable per-model ids
  // and "Description" for the snippet.
  const apiIds = new Array(modelNames.length).fill(null);
  const descriptions = new Array(modelNames.length).fill("");

  rows.each((_i, row) => {
    const cells = $(row).find("th, td");
    if (cells.length < 2) return;
    const label = cells.eq(0).text().trim().toLowerCase();
    if (label === "claude api id") {
      cells.each((j, cell) => {
        if (j === 0 || j > modelNames.length) return;
        apiIds[j - 1] = $(cell).text().trim();
      });
    } else if (label === "description") {
      cells.each((j, cell) => {
        if (j === 0 || j > modelNames.length) return;
        descriptions[j - 1] = $(cell).text().trim();
      });
    }
  });

  if (apiIds.some((id) => !id)) {
    throw new Error('model-table: "Claude API ID" row missing or incomplete');
  }

  const baseUrl = source.url.replace(/#.*$/, "");
  const anchor = "latest-models-comparison";

  return modelNames.map((name, idx) => ({
    id: apiIds[idx],
    title: name,
    date: null,
    url: `${baseUrl}#${anchor}`,
    snippet: (descriptions[idx] || "").slice(0, 300),
    source: source.key,
    sourceCategory: source.category,
    sourceName: source.name,
  }));
}

export async function scrapeDocsPage(source) {
  const res = await fetchSource(source.url, {}, source.fixtureFile);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.url}`);
  const html = await res.text();

  let items;
  switch (source.parseMode) {
    case "intercom-article":
      items = parseIntercomArticle(html, source);
      break;
    case "docs-hash":
      items = parseDocsHash(html, source);
      break;
    case "model-table":
      items = parseModelTable(html, source);
      break;
    default:
      throw new Error(`unknown parseMode "${source.parseMode}"`);
  }
  return items;
}
