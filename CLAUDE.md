# CLAUDE.md

anthropic-watch — Monitors 17 Anthropic sources daily for changes and publishes structured RSS/JSON/OPML feeds to GitHub Pages.

## Key Files

- `docs/spec/PROGRESS.md` — Read first every session
- `docs/spec/SPEC.md` — Source of truth
- `docs/ARCHITECTURE.md` — Pipeline design, concurrency, state, error handling
- `docs/SOURCES.md` — All monitored sources with detection methods
- `docs/FEED-SCHEMA.md` — JSON and RSS schema reference
- `docs/WORCLAUDE-INTEGRATION.md` — Primary consumer integration guide
- `CHANGELOG.md` — Version history

## Tech Stack

- Node.js 20+, ESM, plain JavaScript (no TypeScript, no build step, no bundler)
- Runtime deps: `cheerio` (HTML parsing), `fast-xml-parser` (RSS/OPML generation)
- Dev deps: `vitest` (tests), `yaml` (test helpers)
- No ORM, no database — state is `state/last-seen.json` committed to `main`
- No server — GitHub Actions cron + GitHub Pages static hosting

## Commands

```bash
npm start              # Run the full pipeline locally
npm test               # Run vitest (unit + scraper + e2e)
npm run test:watch     # Vitest watch mode
npm run test:live      # Re-capture fixtures from live sources
GITHUB_TOKEN=ghp_xxx npm start   # Higher GitHub API rate limits
```

## Skills (read on demand, not upfront)

See `.claude/skills/` — load only what's relevant:

- context-management/SKILL.md — Session lifecycle
- claude-md-maintenance/SKILL.md — CLAUDE.md self-healing
- coding-principles/SKILL.md — Behavioral principles
- git-conventions/SKILL.md — Commits, branches, versioning
- planning-with-files/SKILL.md — Implementation planning
- prompt-engineering/SKILL.md — Prompting patterns
- review-and-handoff/SKILL.md — Session endings
- verification/SKILL.md — How to verify work
- testing/SKILL.md — Test philosophy and patterns
- subagent-usage/SKILL.md — When and how to use subagents
- security-checklist/SKILL.md — Security review checklist
- coordinator-mode/SKILL.md — Multi-agent orchestration
- agent-routing/SKILL.md — When and how to use each installed agent (READ EVERY SESSION)
- backend-conventions/SKILL.md — Scraper contract, retry, state, feeds
- frontend-design-system/SKILL.md — Dashboard (static HTML, vanilla DOM)
- project-patterns/SKILL.md — Pipeline layout, error philosophy, naming

## Session Protocol

**Start:** Read PROGRESS.md → Read `.claude/skills/agent-routing/SKILL.md` → Read active implementation prompt if any.
**During:** One task at a time. Commit after each. Use subagents per routing guide.
**Feature branch:** /start → work → /verify → /commit-push-pr
**After merging PRs:** git checkout develop → git pull → /conflict-resolver (if needed) → /sync
**Mid-task stop:** /end (writes handoff file)

## Critical Rules

1. SPEC.md is source of truth. Do not invent features.
2. Test before moving on.
3. Ask if ambiguous. Do not guess.
4. Read source files before writing. Never assume.
5. Self-healing: same mistake twice → update CLAUDE.md.
6. Use subagents to keep main context clean.
7. Mediocre fix → scrap it, implement elegantly.
8. Feature branches NEVER modify shared-state files. Those are updated only on develop via /sync after merging PRs. See git-conventions.md Shared-State Files for the canonical list.
9. Never add Co-Authored-By trailers, AI attribution footers, or "Generated with" signatures to commits or PRs.
10. Surgical changes only — every changed line must trace to the request. Don't "improve" adjacent code, comments, or formatting.
11. Push back when simpler approaches exist. Present alternatives, don't pick silently.
12. Transform tasks to success criteria. "Fix the bug" → "Write a failing test, then make it pass."

## Project-Specific Rules

1. **No browser automation.** No Playwright, Puppeteer, or headless Chrome. All HTML is fetched via `fetch` + parsed with `cheerio`. Pages requiring JS-rendered data are solved with a new `parseMode` (RSC payload extraction, API endpoint discovery, etc.) — never by adding a browser.
2. **No authenticated endpoints beyond `GITHUB_TOKEN`.** No Anthropic API keys, no OAuth flows, no paid services. Every source must be fetchable from a stock GitHub Actions runner with only `GITHUB_TOKEN`.
3. **No private or paid Anthropic surfaces.** Public web pages, public GitHub repos, public npm, public docs, public status page only. Never the Anthropic Console, billing, or logged-in surfaces.
4. **Scrapers never catch their own errors.** They throw; `Promise.allSettled` in `src/index.js` handles aggregation. Wrapping scraper logic in `try/catch { return [] }` is forbidden — that was the v1.0.1 silent-failure root cause.
5. **No shared error class hierarchy.** Plain `Error` with descriptive messages. Don't introduce `ScraperError`, `FetchError`, etc.
6. **No new dependencies without justification.** Current deps are `cheerio` + `fast-xml-parser` only. New deps require a CHANGELOG entry explaining why existing tools couldn't do the job.
7. **No npm publish.** Ships as GitHub Releases only — it's infrastructure, not a package.
8. **State file is append-friendly only.** Never delete keys from `state/last-seen.json`; only add or update. Removing a source from `sources.js` should leave its state entry untouched.
9. **CHANGELOG.md must be updated** in the same PR as any user-visible change (new source, scraper change, schema change, security fix). Internal refactors don't require it.
10. **Docs update in the same PR as the code.** If a PR adds a source, `README.md`, `docs/SOURCES.md`, and any source-count references are updated in that PR — never a follow-up.
11. **Source count consistency.** Any change in source count must propagate to the README badge, the "Monitors X sources" line, `docs/SOURCES.md` headers, and any test assertions.
12. **Version bumps happen on the release commit**, not PR-by-PR. Tagged GitHub Releases are the source of truth.

## Memory Architecture

- This file: static project rules. Keep under 200 lines.
- Native memory (`/memory`): auto-captured project knowledge.
- Persistent corrections: `.claude/learnings/` via [LEARN] blocks or `/learn`.
- Path-scoped rules: `.claude/rules/` with YAML frontmatter.
- Session state: `.claude/sessions/` (gitignored).
- Team decisions: `docs/memory/decisions.md` (version-controlled).
- Team preferences: `docs/memory/preferences.md` (version-controlled).
- Do NOT write session learnings or auto-captured patterns here.

## Learnings

Corrections captured via [LEARN] blocks live in `.claude/learnings/`. SessionStart loads recent ones automatically.

## Gotchas

- **`nextjs-rsc` parse mode depends on undocumented Next.js internals** (`self.__next_f.push` chunk format). Re-validate both the primary and HTML-fallback paths after any Anthropic blog redesign. See `docs/ARCHITECTURE.md — nextjs-rsc Known Brittleness`.
- **`SCRAPER_PAT` is required in CI**, not `GITHUB_TOKEN` alone. The default `GITHUB_TOKEN` does not trigger downstream workflows on push — the PAT is used for both checkout and gh-pages deploy so fan-out works. Scope: `repo` + `workflow`.
- **First-run new source emits a backfill burst.** `github-releases` sources emit the 30 most recent items; changelog sources emit one; blog sources emit whatever's currently listed. This is expected and settles after the first run.
- **`[Unreleased]` changelog sections use "new-wins" merge semantics** — the latest scrape overwrites the persisted item's title/snippet/date. See `docs/FEED-SCHEMA.md — Merge Semantics`.
- **Never use `--no-verify` on git commits.** Fix the underlying hook failure instead.
