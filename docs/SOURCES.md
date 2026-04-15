# Sources

anthropic-watch monitors **16 sources** using **6 scraper types**, organized into two tiers.

## Source Tiers

- **Core** (10 sources): Primary Anthropic product and developer surfaces. These are the highest-signal sources for tracking releases, API changes, and tooling updates.
- **Extended** (6 sources): Research, alignment, and supplementary blogs plus the status page. Useful for broader awareness but update less frequently.

---

## Core Sources

### blog-engineering

- **Key:** `blog-engineering`
- **Name:** Anthropic Engineering Blog
- **URL:** https://www.anthropic.com/engineering
- **Scraper:** `blog-page`
- **Config:** `parseMode: "nextjs-rsc"`, `basePath: "/engineering"`
- **Tracks:** Engineering blog posts
- **Detection:** Extracts post objects from Next.js RSC inline payload; falls back to HTML link parsing
- **Update frequency:** Weekly to monthly
- **Feed:** [`blog-engineering.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-engineering.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-engineering.xml)
- **Quirks:** RSC payload structure may change between Next.js versions

### blog-news

- **Key:** `blog-news`
- **Name:** Anthropic News Blog
- **URL:** https://www.anthropic.com/news
- **Scraper:** `blog-page`
- **Config:** `parseMode: "nextjs-rsc"`, `basePath: "/news"`
- **Tracks:** Company announcements, product launches, policy updates
- **Detection:** Same as `blog-engineering` — Next.js RSC payload extraction
- **Update frequency:** Weekly
- **Feed:** [`blog-news.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-news.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-news.xml)
- **Quirks:** Shares site framework with engineering blog

### docs-release-notes

- **Key:** `docs-release-notes`
- **Name:** Anthropic Docs Release Notes
- **URL:** https://docs.anthropic.com/en/docs/about-claude/models
- **Scraper:** `docs-page`
- **Config:** `parseMode: "docs-hash"`
- **Tracks:** Changes to the models documentation page (model additions, deprecations)
- **Detection:** SHA-256 hash of page body text — any content change produces a new hash
- **Update frequency:** When models are added or updated
- **Feed:** [`docs-release-notes.json`](https://sefaertunc.github.io/anthropic-watch/feeds/docs-release-notes.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/docs-release-notes.xml)
- **Quirks:** Always emits exactly 1 item; ID changes on every content edit, so item churn is expected

### claude-code-changelog

- **Key:** `claude-code-changelog`
- **Name:** Claude Code Changelog
- **URL:** https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- **Scraper:** `github-changelog`
- **Config:** `owner: "anthropics"`, `repo: "claude-code"`, `file: "CHANGELOG.md"`
- **Tracks:** Latest changelog entry from the CHANGELOG.md file
- **Detection:** Fetches file via GitHub Contents API, base64-decodes, SHA-256 hashes content, extracts topmost `## ` section
- **Update frequency:** Multiple times per week
- **Feed:** [`claude-code-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-changelog.xml)
- **Quirks:** Only the most recent `## ` entry is extracted; date is set to scrape time

### support-release-notes

- **Key:** `support-release-notes`
- **Name:** Anthropic Support Release Notes
- **URL:** https://support.claude.com/en/articles/12138966-release-notes
- **Scraper:** `docs-page`
- **Config:** `parseMode: "intercom-article"`
- **Tracks:** Customer-facing release notes on the support site
- **Detection:** Parses `<h3>` elements as date headings, extracts sibling `<p>` content
- **Update frequency:** Weekly
- **Feed:** [`support-release-notes.json`](https://sefaertunc.github.io/anthropic-watch/feeds/support-release-notes.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/support-release-notes.xml)
- **Quirks:** Relies on Intercom article body classes (`.article_body`, `.intercom-article-body`)

### claude-code-releases

- **Key:** `claude-code-releases`
- **Name:** Claude Code Releases
- **URL:** https://github.com/anthropics/claude-code/releases
- **Scraper:** `github-releases`
- **Config:** `owner: "anthropics"`, `repo: "claude-code"`
- **Tracks:** GitHub Releases for the Claude Code CLI
- **Detection:** GitHub REST API, fetches 10 most recent releases, ID = `tag_name`
- **Update frequency:** Multiple times per week
- **Feed:** [`claude-code-releases.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-releases.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-releases.xml)
- **Quirks:** Requires `GITHUB_TOKEN` for reliable rate limits

### npm-claude-code

- **Key:** `npm-claude-code`
- **Name:** Claude Code npm Package
- **URL:** https://www.npmjs.com/package/@anthropic-ai/claude-code
- **Scraper:** `npm-registry`
- **Config:** `packageName: "@anthropic-ai/claude-code"`
- **Tracks:** Latest published version on npm
- **Detection:** Fetches `/latest` endpoint, then full package doc for publish timestamp. ID = version string
- **Update frequency:** Multiple times per week (tracks same releases as `claude-code-releases`)
- **Feed:** [`npm-claude-code.json`](https://sefaertunc.github.io/anthropic-watch/feeds/npm-claude-code.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/npm-claude-code.xml)
- **Quirks:** Always emits exactly 1 item (latest version only)

### agent-sdk-ts-changelog

- **Key:** `agent-sdk-ts-changelog`
- **Name:** Agent SDK TypeScript Changelog
- **URL:** https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
- **Scraper:** `github-changelog`
- **Config:** `owner: "anthropics"`, `repo: "claude-agent-sdk-typescript"`, `file: "CHANGELOG.md"`
- **Tracks:** Latest changelog entry for the TypeScript Agent SDK
- **Detection:** Same as `claude-code-changelog`
- **Update frequency:** Weekly to monthly
- **Feed:** [`agent-sdk-ts-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-ts-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-ts-changelog.xml)
- **Quirks:** Same single-entry extraction as other changelog scrapers

### agent-sdk-py-changelog

- **Key:** `agent-sdk-py-changelog`
- **Name:** Agent SDK Python Changelog
- **URL:** https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md
- **Scraper:** `github-changelog`
- **Config:** `owner: "anthropics"`, `repo: "claude-agent-sdk-python"`, `file: "CHANGELOG.md"`
- **Tracks:** Latest changelog entry for the Python Agent SDK
- **Detection:** Same as `claude-code-changelog`
- **Update frequency:** Weekly to monthly
- **Feed:** [`agent-sdk-py-changelog.json`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-py-changelog.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/agent-sdk-py-changelog.xml)
- **Quirks:** Same single-entry extraction as other changelog scrapers

### api-sdk-ts-releases

- **Key:** `api-sdk-ts-releases`
- **Name:** Anthropic SDK TypeScript Releases
- **URL:** https://github.com/anthropics/anthropic-sdk-typescript/releases
- **Scraper:** `github-releases`
- **Config:** `owner: "anthropics"`, `repo: "anthropic-sdk-typescript"`
- **Tracks:** GitHub Releases for the official TypeScript SDK
- **Detection:** Same as `claude-code-releases`
- **Update frequency:** Weekly to monthly
- **Feed:** [`api-sdk-ts-releases.json`](https://sefaertunc.github.io/anthropic-watch/feeds/api-sdk-ts-releases.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/api-sdk-ts-releases.xml)
- **Quirks:** Same rate limit considerations as other GitHub sources

---

## Extended Sources

### claude-code-action

- **Key:** `claude-code-action`
- **Name:** Claude Code Action Releases
- **URL:** https://github.com/anthropics/claude-code-action/releases
- **Scraper:** `github-releases`
- **Config:** `owner: "anthropics"`, `repo: "claude-code-action"`
- **Tracks:** GitHub Releases for the Claude Code GitHub Action
- **Detection:** Same as `claude-code-releases`
- **Update frequency:** Monthly
- **Feed:** [`claude-code-action.json`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-action.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/claude-code-action.xml)

### blog-alignment

- **Key:** `blog-alignment`
- **Name:** Anthropic Alignment Blog
- **URL:** https://alignment.anthropic.com
- **Scraper:** `blog-page`
- **Config:** `parseMode: "distill"`
- **Tracks:** Alignment and interpretability research posts
- **Detection:** Parses Distill.pub-style TOC (`.toc .date` and `.toc a.note` elements)
- **Update frequency:** Monthly to quarterly
- **Feed:** [`blog-alignment.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-alignment.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-alignment.xml)
- **Quirks:** Dates are grouped — a `.date` element followed by multiple `.note` links share the same date

### blog-red-team

- **Key:** `blog-red-team`
- **Name:** Anthropic Red Team Blog
- **URL:** https://red.anthropic.com
- **Scraper:** `blog-page`
- **Config:** `parseMode: "distill"`
- **Tracks:** Red teaming research and trust & safety posts
- **Detection:** Same Distill.pub parsing as `blog-alignment`
- **Update frequency:** Monthly to quarterly
- **Feed:** [`blog-red-team.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-red-team.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-red-team.xml)

### blog-research

- **Key:** `blog-research`
- **Name:** Anthropic Research Blog
- **URL:** https://www.anthropic.com/research
- **Scraper:** `blog-page`
- **Config:** `parseMode: "nextjs-rsc"`, `basePath: "/research"`
- **Tracks:** Research papers and technical deep-dives
- **Detection:** Same Next.js RSC parsing as `blog-engineering`
- **Update frequency:** Monthly
- **Feed:** [`blog-research.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-research.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-research.xml)

### blog-claude

- **Key:** `blog-claude`
- **Name:** Anthropic Claude Blog
- **URL:** https://claude.com/blog
- **Scraper:** `blog-page`
- **Config:** `parseMode: "webflow"`
- **Tracks:** Claude product blog posts
- **Detection:** Parses Webflow CMS items (`.blog_cms_item`, `.w-dyn-item` classes)
- **Update frequency:** Weekly to monthly
- **Feed:** [`blog-claude.json`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-claude.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/blog-claude.xml)
- **Quirks:** Webflow class names may change with site redesigns

### status-page

- **Key:** `status-page`
- **Name:** Anthropic Status Page
- **URL:** https://status.anthropic.com
- **Scraper:** `status-page`
- **Config:** (none — URL-derived)
- **Tracks:** Incidents and outages from the Statuspage.io-powered status page
- **Detection:** Fetches `/api/v2/incidents.json`, extracts up to 20 incidents. ID = incident ID
- **Update frequency:** On incidents (variable)
- **Feed:** [`status-page.json`](https://sefaertunc.github.io/anthropic-watch/feeds/status-page.json) / [`.xml`](https://sefaertunc.github.io/anthropic-watch/feeds/status-page.xml)
- **Quirks:** Snippet includes impact level and latest update body

---

## Scraper Type Reference

| Scraper Type       | Method                      | Parse Modes                        | Sources                                                                                |
| ------------------ | --------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `github-releases`  | GitHub REST API + fetch     | —                                  | claude-code-releases, api-sdk-ts-releases, claude-code-action                          |
| `github-changelog` | GitHub Contents API + fetch | —                                  | claude-code-changelog, agent-sdk-ts-changelog, agent-sdk-py-changelog                  |
| `npm-registry`     | npm registry API + fetch    | —                                  | npm-claude-code                                                                        |
| `blog-page`        | fetch + cheerio             | `nextjs-rsc`, `webflow`, `distill` | blog-engineering, blog-news, blog-research, blog-alignment, blog-red-team, blog-claude |
| `docs-page`        | fetch + cheerio             | `intercom-article`, `docs-hash`    | docs-release-notes, support-release-notes                                              |
| `status-page`      | Statuspage.io API + fetch   | —                                  | status-page                                                                            |

All scrapers use `fetch` (with retry) for HTTP requests. HTML scrapers use `cheerio` for DOM parsing. There is no browser automation.

---

## Source Health

Each source tracks health via state:

- `consecutiveFailures` — incremented on error, reset on success
- Warning logged at **3** consecutive failures
- `lastSuccess` — timestamp of last successful scrape

Check source health in:

- The [dashboard](https://sefaertunc.github.io/anthropic-watch/)
- `run-report.json` → each source's `status` and `error` fields
- `run-history.json` → `errors` array across runs
