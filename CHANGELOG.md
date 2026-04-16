# Changelog

## [1.0.0] - 2026-04-16

### Added

- Initial release of anthropic-watch
- 16 monitored Anthropic sources across 6 scraper types
- GitHub API scrapers for releases and changelogs (claude-code-releases, api-sdk-ts-releases, claude-code-action, claude-code-changelog, agent-sdk-ts-changelog, agent-sdk-py-changelog)
- npm registry scraper for package version tracking (npm-claude-code)
- Blog page scrapers using fetch + cheerio with three parse modes: nextjs-rsc, webflow, distill (blog-engineering, blog-news, blog-research, blog-alignment, blog-red-team, blog-claude)
- Docs page scrapers with intercom-article and docs-hash parse modes (docs-release-notes, support-release-notes)
- Status page scraper using Statuspage.io REST API (status-page)
- SHA-256 content hash change detection for changelogs and docs pages
- URL-based and version-based change detection for blogs and packages
- RSS 2.0 and JSON feed generation with accumulation (last 100 items for all, 50 per-source)
- Per-source individual feeds (JSON + RSS for each of the 16 sources)
- OPML 2.0 file for bulk RSS subscription with Core/Extended grouping
- Run reports with per-source timing, error tracking, and summary statistics
- Rolling run history (last 30 runs) with error details
- GitHub Pages dashboard with source status, recent items, and health badges
- Consecutive failure tracking with warning at 3 failures
- Retry logic with linear backoff (1s, 2s) and 15s timeout per request
- Concurrency-limited scraper execution (limit of 4 via Set-based Promise.race)
- Fixture-based test suite with vitest
- Fixture injection via fetchSource abstraction for deterministic testing
- Fixture capture script for refreshing test data from live sources
- E2E tests for full pipeline, no-changes detection, and error resilience
- Unit tests for feeds, state, date parsing, retry logic, and logging
- Per-scraper tests for all 6 scraper types
- GitHub Actions workflow with daily cron schedule (06:00 UTC)
- GitHub Actions job summary with markdown table and consecutive failure warnings
- Separate CI test workflow on push and pull request
- GitHub Pages deployment via peaceiris/actions-gh-pages
- Bot commit for state persistence (anthropic-watch[bot])
- Comprehensive documentation (6 docs: Architecture, Sources, Feed Schema, Adding Sources, Troubleshooting, Worclaude Integration)
