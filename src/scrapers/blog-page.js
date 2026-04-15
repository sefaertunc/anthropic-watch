import * as cheerio from "cheerio";

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

/**
 * Recursively walk a JSON value, collecting objects that have both `slug` and `title` fields.
 */
function collectPosts(obj, results) {
  if (!obj || typeof obj !== "object") return;
  // Match objects that look like blog posts: have slug + title + publishedOn
  // but skip page-level objects (_type === "page") which also have slug + title
  if (
    obj.slug &&
    obj.title &&
    typeof obj.title === "string" &&
    obj.publishedOn &&
    obj._type !== "page" &&
    (typeof obj.slug === "string" || typeof obj.slug?.current === "string")
  ) {
    results.push(obj);
    return; // don't recurse into children of a matched post
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectPosts(item, results);
  } else {
    for (const val of Object.values(obj)) collectPosts(val, results);
  }
}

function parseNextjsRscJson(html, source) {
  // Extract all self.__next_f.push([1, "..."]) payload strings
  const payloadRegex =
    /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
  const chunks = [];
  let match;
  while ((match = payloadRegex.exec(html)) !== null) {
    try {
      const unescaped = JSON.parse('"' + match[1] + '"');
      chunks.push(unescaped);
    } catch {
      // skip malformed chunks
    }
  }

  if (chunks.length === 0) return [];

  const concatenated = chunks.join("");
  const lines = concatenated.split(/\n(?=[\da-f]+:)/);

  const allPosts = [];
  for (const line of lines) {
    if (!line.includes('"slug"') || !line.includes('"title"')) continue;
    const jsonStart = line.indexOf(":");
    if (jsonStart === -1) continue;
    const jsonStr = line.slice(jsonStart + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      collectPosts(parsed, allPosts);
    } catch {
      // not valid JSON, skip
    }
  }

  // Deduplicate by slug
  const seen = new Set();
  const unique = [];
  for (const post of allPosts) {
    const slugVal =
      typeof post.slug === "string" ? post.slug : post.slug?.current;
    if (!slugVal || seen.has(slugVal)) continue;
    seen.add(slugVal);
    unique.push(post);
  }

  const origin = new URL(source.url).origin;

  return unique.map((post) => {
    const slugVal =
      typeof post.slug === "string" ? post.slug : post.slug?.current;
    const postUrl = `${origin}${source.basePath}/${slugVal}`;
    const summary = (
      post.summary ||
      post.subtitle ||
      post.description ||
      ""
    ).slice(0, 300);
    return {
      id: postUrl,
      title: post.title,
      date: parseFlexibleDate(post.publishedOn || post.date || post._createdAt),
      url: postUrl,
      snippet: summary,
      source: source.key,
    };
  });
}

/**
 * HTML fallback for anthropic.com pages where RSC JSON doesn't contain article data.
 * Parses rendered HTML links to /{basePath}/* with title/date/snippet children.
 */
function parseNextjsRscHtml(html, source) {
  const $ = cheerio.load(html);
  const items = [];
  const origin = new URL(source.url).origin;
  const seen = new Set();

  $(`a[href^="${source.basePath}/"]`).each((_i, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href || seen.has(href)) return;

    // Title from h2/h3/h4 or [class*='title'] inside the link
    const title = (
      $a.find("h2, h3, h4").first().text() ||
      $a.find("[class*='title']").first().text()
    ).trim();
    if (!title) return;

    seen.add(href);
    const postUrl = `${origin}${href}`;

    // Date from time element
    const dateText = ($a.find("time").first().text() || "").trim();

    // Snippet from p element
    const snippet = ($a.find("p").first().text() || "").trim().slice(0, 300);

    items.push({
      id: postUrl,
      title,
      date: parseFlexibleDate(dateText),
      url: postUrl,
      snippet,
      source: source.key,
    });
  });

  return items;
}

function parseNextjsRsc(html, source) {
  // Try RSC JSON extraction first
  const items = parseNextjsRscJson(html, source);
  if (items.length > 0) return items;

  // Fallback to HTML parsing (e.g. /news page renders articles as HTML)
  return parseNextjsRscHtml(html, source);
}

function parseWebflow(html, source) {
  const $ = cheerio.load(html);
  const items = [];
  const origin = new URL(source.url).origin;

  // Try Webflow CMS item selectors
  const postEls = $(".blog_cms_item, .w-dyn-item");

  postEls.each((_i, el) => {
    const $el = $(el);

    // Title
    const title = (
      $el.find(".card_blog_title").first().text() ||
      $el.find("h2, h3").first().text()
    ).trim();
    if (!title) return;

    // Link
    const linkEl = $el.find("a[href]").first();
    const href = linkEl.attr("href");
    if (!href) return;
    const postUrl = href.startsWith("http") ? href : new URL(href, origin).href;

    // Date
    const dateText = (
      $el.find("[class*='date']").first().text() ||
      $el.find("time").first().text() ||
      $el.find("time").first().attr("datetime") ||
      ""
    ).trim();
    const date = parseFlexibleDate(dateText);

    // Snippet
    const snippet = (
      $el.find("p").first().text() ||
      $el.find("[class*='description'], [class*='excerpt']").first().text() ||
      ""
    )
      .trim()
      .slice(0, 300);

    items.push({
      id: postUrl,
      title,
      date,
      url: postUrl,
      snippet,
      source: source.key,
    });
  });

  return items;
}

function parseDistill(html, source) {
  const $ = cheerio.load(html);
  const items = [];
  const baseUrl = source.url.replace(/\/$/, "");

  // Structure: div.toc contains div.date month headers and a.note post links
  // Posts may be direct children or nested in wrapper divs (e.g. embargoed posts)
  let lastDate = "";
  $(".toc .date, .toc a.note").each((_i, el) => {
    const $el = $(el);

    if ($el.hasClass("date")) {
      lastDate = $el.text().trim();
      return;
    }

    // It's an a.note
    const h3 = $el.find("h3");
    if (h3.length === 0) return;

    const title = h3.text().trim();
    if (!title) return;

    const href = $el.attr("href");
    if (!href) return;
    const postUrl = href.startsWith("http")
      ? href
      : new URL(href, baseUrl + "/").href;

    const snippet = ($el.find(".description").first().text() || "")
      .trim()
      .slice(0, 300);
    const date = parseFlexibleDate(lastDate);

    items.push({
      id: postUrl,
      title,
      date,
      url: postUrl,
      snippet,
      source: source.key,
    });
  });

  return items;
}

export async function scrapeBlogPage(source) {
  try {
    const html = await fetchHtml(source.url);
    let items;
    switch (source.parseMode) {
      case "nextjs-rsc":
        items = parseNextjsRsc(html, source);
        break;
      case "webflow":
        items = parseWebflow(html, source);
        break;
      case "distill":
        items = parseDistill(html, source);
        break;
      default:
        console.warn(
          `[blog-page] ${source.key}: unknown parseMode "${source.parseMode}"`,
        );
        return [];
    }
    if (items.length === 0)
      console.warn(`[blog-page] ${source.key}: no items found`);
    return items.slice(0, 20);
  } catch (err) {
    console.error(`[blog-page] ${source.key}: ${err.message}`);
    return [];
  }
}
