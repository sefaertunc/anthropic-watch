# Sources

anthropic-watch monitors **16 sources** using **6 scraper types**, organized into two tiers.

## Source Tiers

- **Core** (10 sources): Primary Anthropic product and developer surfaces. These are the highest-signal sources for tracking releases, API changes, and tooling updates.
- **Extended** (6 sources): Research, alignment, and supplementary blogs plus the status page. Useful for broader awareness but update less frequently.

---

## Core Sources

### 1. Anthropic Engineering Blog

- **Key**: `blog-engineering`
- **URL**: https://www.anthropic.com/engineering
- **Scraper type**: `blog-page` (`parseMode: "nextjs-rsc"`, `basePath: "/engineering"`)
- **What it tracks**: Engineering blog posts covering infrastructure, tooling, and technical deep-dives.
- **Detection method**: Extracts post objects from Next.js RSC inline payload (`self.__next_f.push` chunks), looking for objects with `slug`, `title`, and `publishedOn` fields. Falls back to HTML link parsing (`a[href^="/engineering/"]`) with cheerio if RSC extraction yields no results. ID = post URL.
- **Update frequency**: Weekly to monthly
- **Feed**: [`blog-engineering.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-engineering.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-engineering.xml)
- **Notes**: RSC payload structure may change between Next.js versions. The fallback HTML parser looks for `h2, h3, h4` and `[class*='title']` within links.

### 2. Anthropic News Blog

- **Key**: `blog-news`
- **URL**: https://www.anthropic.com/news
- **Scraper type**: `blog-page` (`parseMode: "nextjs-rsc"`, `basePath: "/news"`)
- **What it tracks**: Company announcements, product launches, policy updates, and partnerships.
- **Detection method**: Same Next.js RSC payload extraction as blog-engineering. ID = post URL.
- **Update frequency**: Weekly
- **Feed**: [`blog-news.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-news.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-news.xml)
- **Notes**: Shares site framework with engineering blog.

### 3. Anthropic Docs Release Notes

- **Key**: `docs-release-notes`
- **URL**: https://docs.anthropic.com/en/docs/about-claude/models
- **Scraper type**: `docs-page` (`parseMode: "model-table"`)
- **What it tracks**: The current Claude model lineup — one item per model (Opus, Sonnet, Haiku, etc.), keyed by Claude API ID.
- **Detection method**: Parses the first `<table>` on the models reference page. Header row cells become model display names (e.g., `"Claude Opus 4.6"`); the row labelled `"Claude API ID"` supplies the stable per-model id (e.g., `claude-opus-4-6`); the `"Description"` row supplies the snippet. One item is emitted per model column. Throws if the table or the `"Claude API ID"` row is missing.
- **Update frequency**: When models are added, renamed, or deprecated
- **Feed**: [`docs-release-notes.json`](https://sefaertunc.github.io/anthropic-watch/feeds/docs-release-notes.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/docs-release-notes.xml)
- **Notes**: No churn on unrelated page edits — ids derive from the Claude API ID row, not the full body. Date is `null` (no per-model release date on the page).

### 4. Claude Code Changelog

- **Key**: `claude-code-changelog`
- **URL**: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- **Scraper type**: `github-changelog` (`owner: "anthropics"`, `repo: "claude-code"`, `file: "CHANGELOG.md"`)
- **What it tracks**: Latest changelog entry from the CHANGELOG.md file in the Claude Code repo.
- **Detection method**: Fetches file via GitHub Contents API (`/repos/anthropics/claude-code/contents/CHANGELOG.md`), base64-decodes content, extracts the topmost `## ` section. ID = first `## ` heading text (e.g., `"2.1.109"`, `"[Unreleased]"`); falls back to a 12-char SHA-256 hash of the full file if no heading is found.
- **Update frequency**: Multiple times per week
- **Feed**: [`claude-code-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-changelog.xml)
- **Notes**: Only the most recent `## ` entry is extracted. Date is set to scrape time, not the date in the heading. `[Unreleased]` sections accumulate edits under one ID until a version heading replaces them. Requires `GITHUB_TOKEN` for rate limits.

### 5. Anthropic Support Release Notes

- **Key**: `support-release-notes`
- **URL**: https://support.claude.com/en/articles/12138966-release-notes
- **Scraper type**: `docs-page` (`parseMode: "intercom-article"`)
- **What it tracks**: Customer-facing release notes on the Anthropic support site.
- **Detection method**: Parses Intercom article body (`.article_body`, `.intercom-article-body`, or `<article>`). Finds `<h3>` elements as date headings, extracts bold text from sibling paragraphs as titles, collects `<p>` text as snippets. ID = URL with anchor.
- **Update frequency**: Weekly
- **Feed**: [`support-release-notes.json`](https://sefaertunc.github.io/anthropic-watch/feeds/support-release-notes.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/support-release-notes.xml)
- **Notes**: Relies on Intercom article body classes. Max 20 items per scrape.

### 6. Claude Code Releases

- **Key**: `claude-code-releases`
- **URL**: https://github.com/anthropics/claude-code/releases
- **Scraper type**: `github-releases` (`owner: "anthropics"`, `repo: "claude-code"`)
- **What it tracks**: GitHub Releases for the Claude Code CLI.
- **Detection method**: GitHub REST API (`/repos/anthropics/claude-code/releases?per_page=10`). ID = `tag_name`, date = `published_at`. Release body is stripped of markdown formatting for the snippet.
- **Update frequency**: Multiple times per week
- **Feed**: [`claude-code-releases.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-releases.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-releases.xml)
- **Notes**: Requires `GITHUB_TOKEN` for reliable rate limits.

### 7. Claude Code npm Package

- **Key**: `npm-claude-code`
- **URL**: https://www.npmjs.com/package/@anthropic-ai/claude-code
- **Scraper type**: `npm-registry` (`packageName: "@anthropic-ai/claude-code"`)
- **What it tracks**: Latest published version on npm.
- **Detection method**: Two API calls — `registry.npmjs.org/@anthropic-ai/claude-code/latest` for version and description, then `registry.npmjs.org/@anthropic-ai/claude-code` (full doc) for the `time[version]` publish timestamp. ID = version string.
- **Update frequency**: Multiple times per week (tracks same releases as claude-code-releases)
- **Feed**: [`npm-claude-code.json`](https://sefaertunc.github.io/anthropic-watch/feeds/npm-claude-code.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/npm-claude-code.xml)
- **Notes**: Always emits exactly 1 item (latest version only). Uses `fixtureFileFull` for the full package doc fixture in tests.

### 8. Agent SDK TypeScript Changelog

- **Key**: `agent-sdk-ts-changelog`
- **URL**: https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
- **Scraper type**: `github-changelog` (`owner: "anthropics"`, `repo: "claude-agent-sdk-typescript"`, `file: "CHANGELOG.md"`)
- **What it tracks**: Latest changelog entry for the TypeScript Agent SDK.
- **Detection method**: Same as claude-code-changelog — GitHub Contents API, base64 decode, topmost `## ` heading as ID (hash fallback if no heading).
- **Update frequency**: Weekly to monthly
- **Feed**: [`agent-sdk-ts-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-ts-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-ts-changelog.xml)
- **Notes**: Same single-entry extraction as other changelog scrapers.

### 9. Agent SDK Python Changelog

- **Key**: `agent-sdk-py-changelog`
- **URL**: https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md
- **Scraper type**: `github-changelog` (`owner: "anthropics"`, `repo: "claude-agent-sdk-python"`, `file: "CHANGELOG.md"`)
- **What it tracks**: Latest changelog entry for the Python Agent SDK.
- **Detection method**: Same as claude-code-changelog — topmost `## ` heading as ID (hash fallback if no heading).
- **Update frequency**: Weekly to monthly
- **Feed**: [`agent-sdk-py-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-py-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-py-changelog.xml)
- **Notes**: Same single-entry extraction as other changelog scrapers.

### 10. Anthropic SDK TypeScript Releases

- **Key**: `api-sdk-ts-releases`
- **URL**: https://github.com/anthropics/anthropic-sdk-typescript/releases
- **Scraper type**: `github-releases` (`owner: "anthropics"`, `repo: "anthropic-sdk-typescript"`)
- **What it tracks**: GitHub Releases for the official Anthropic TypeScript SDK.
- **Detection method**: Same as claude-code-releases — GitHub REST API, 10 most recent releases.
- **Update frequency**: Weekly to monthly
- **Feed**: [`api-sdk-ts-releases.json`](https://sefaertunc.github.io/anthropic-watch/feeds/api-sdk-ts-releases.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/api-sdk-ts-releases.xml)
- **Notes**: Same rate limit considerations as other GitHub sources.

---

## Extended Sources

### 11. Claude Code Action Releases

- **Key**: `claude-code-action`
- **URL**: https://github.com/anthropics/claude-code-action/releases
- **Scraper type**: `github-releases` (`owner: "anthropics"`, `repo: "claude-code-action"`)
- **What it tracks**: GitHub Releases for the Claude Code GitHub Action.
- **Detection method**: Same as claude-code-releases.
- **Update frequency**: Monthly
- **Feed**: [`claude-code-action.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-action.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-action.xml)

### 12. Anthropic Alignment Blog

- **Key**: `blog-alignment`
- **URL**: https://alignment.anthropic.com
- **Scraper type**: `blog-page` (`parseMode: "distill"`)
- **What it tracks**: Alignment and interpretability research posts.
- **Detection method**: Parses Distill.pub-style TOC. Reads `.toc .date` elements for date context, then `.toc a.note` elements for post titles (`h3`), links (`href`), and descriptions (`.description`). ID = post URL.
- **Update frequency**: Monthly to quarterly
- **Feed**: [`blog-alignment.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-alignment.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-alignment.xml)
- **Notes**: Dates are grouped — a `.date` element followed by multiple `.note` links share the same date.

### 13. Anthropic Red Team Blog

- **Key**: `blog-red-team`
- **URL**: https://red.anthropic.com
- **Scraper type**: `blog-page` (`parseMode: "distill"`)
- **What it tracks**: Red teaming research and trust & safety posts.
- **Detection method**: Same Distill.pub parsing as blog-alignment.
- **Update frequency**: Monthly to quarterly
- **Feed**: [`blog-red-team.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-red-team.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-red-team.xml)

### 14. Anthropic Research Blog

- **Key**: `blog-research`
- **URL**: https://www.anthropic.com/research
- **Scraper type**: `blog-page` (`parseMode: "nextjs-rsc"`, `basePath: "/research"`)
- **What it tracks**: Research papers and technical deep-dives.
- **Detection method**: Same Next.js RSC parsing as blog-engineering.
- **Update frequency**: Monthly
- **Feed**: [`blog-research.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-research.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-research.xml)

### 15. Anthropic Claude Blog

- **Key**: `blog-claude`
- **URL**: https://claude.com/blog
- **Scraper type**: `blog-page` (`parseMode: "webflow"`)
- **What it tracks**: Claude product blog posts — feature announcements, tips, guides.
- **Detection method**: Parses Webflow CMS items (`.blog_cms_item`, `.w-dyn-item` selectors). Titles from `.card_blog_title` or `h2`/`h3`. Dates from `[class*='date']` or `<time>`. ID = post URL.
- **Update frequency**: Weekly to monthly
- **Feed**: [`blog-claude.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-claude.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-claude.xml)
- **Notes**: Webflow class names may change with site redesigns.

### 16. Anthropic Status Page

- **Key**: `status-page`
- **URL**: https://status.anthropic.com
- **Scraper type**: `status-page`
- **What it tracks**: Incidents and outages from the Statuspage.io-powered status page.
- **Detection method**: Fetches `https://status.anthropic.com/api/v2/incidents.json`, extracts up to 20 incidents. ID = incident ID. Snippet includes impact level and latest update body.
- **Update frequency**: On incidents (variable)
- **Feed**: [`status-page.json`](https://sefaertunc.github.io/anthropic-watch/feeds/status-page.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/status-page.xml)
- **Notes**: Snippet format is `[impact] status — body`.

---

## Scraper Type Reference

| Scraper Type       | Method                      | Parse Modes                                    | Sources                                                                                |
| ------------------ | --------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `github-releases`  | GitHub REST API + fetch     | —                                              | claude-code-releases, api-sdk-ts-releases, claude-code-action                          |
| `github-changelog` | GitHub Contents API + fetch | —                                              | claude-code-changelog, agent-sdk-ts-changelog, agent-sdk-py-changelog                  |
| `npm-registry`     | npm registry API + fetch    | —                                              | npm-claude-code                                                                        |
| `blog-page`        | fetch + cheerio             | `nextjs-rsc`, `webflow`, `distill`             | blog-engineering, blog-news, blog-research, blog-alignment, blog-red-team, blog-claude |
| `docs-page`        | fetch + cheerio             | `intercom-article`, `docs-hash`, `model-table` | docs-release-notes, support-release-notes                                              |
| `status-page`      | Statuspage.io API + fetch   | —                                              | status-page                                                                            |

All scrapers use `fetch` (with retry) for HTTP requests. HTML scrapers use `cheerio` for DOM parsing. There is no browser automation.

---

## Source Health Tracking

Each source tracks health via state:

- **`consecutiveFailures`** — incremented on error, reset to 0 on success
- **Warning threshold**: 3 consecutive failures triggers a warning in logs and GitHub Actions job summary
- **`lastSuccess`** — ISO 8601 timestamp of last successful scrape

Check source health in:

- The [dashboard](https://sefaertunc.github.io/anthropic-watch/) — green/red/amber dots per source
- `run-report.json` → each source's `status` and `error` fields
- `run-history.json` → `errors` array across runs for trend analysis
