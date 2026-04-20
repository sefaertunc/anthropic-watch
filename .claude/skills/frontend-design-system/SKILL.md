---
description: "Dashboard conventions — single static HTML file, vanilla DOM APIs, strict XSS hygiene"
when_to_use: "When editing public/index.html or anything rendering feed data into the dashboard UI"
version: "1.0.0"
paths:
  - "public/**"
---

# Frontend Design System — anthropic-watch

The "frontend" is one file: `public/index.html`. It is a static dashboard that fetches `run-report.json` and `all.json` from GitHub Pages and renders them with vanilla DOM APIs.

There is **no framework** (no React/Vue/Svelte), **no build step** (no bundler, no transpiler, no PostCSS), and **no component library**. These are intentional choices — the dashboard must be viewable by cloning the repo and opening the file, and deployable by copying the file to Pages.

## Rendering Rules

1. **Never use `innerHTML` for anything that includes data.** Build the DOM with `document.createElement(...)` and assign text via `textContent`. The v1.0.1 release replaced all `innerHTML` string templates specifically because they allowed `javascript:` URL XSS through `item.url`.
2. **URLs must be validated before use.** Use the `safeUrl()` helper (rejects anything that isn't `http://` or `https://`) before setting `href` on any element. This applies to `item.url`, `sourceName` links, anything that comes from the feed.
3. **External item links use `rel="noopener noreferrer"`** and `target="_blank"`.
4. **`textContent` over `innerText`** for consistency and performance.
5. **Dates:** format with `toLocaleString()` or equivalent at render time; never trust pre-formatted date strings from the feed (they are ISO 8601, not display-ready).
6. **Null handling:** `item.date` may be `null`; render a sensible placeholder (blank or dash), never "null" or "undefined".

## Data Sources

The dashboard fetches two files from the same origin (GitHub Pages):

- `feeds/run-report.json` — for source status, health, timing
- `feeds/all.json` — for the recent-items list

If a feature needs per-source items, fetch `feeds/{source-key}.json` separately. Never combine: the schemas are intentionally distinct (see `docs/FEED-SCHEMA.md`).

Handle fetch failures gracefully — GitHub Pages can have brief outages. Showing a stale-but-cached view is better than a blank page.

## Styling

Inline `<style>` block at the top of `public/index.html`. No external stylesheets, no Tailwind, no CSS frameworks. Design tokens (colors, spacing) are defined as CSS custom properties in `:root` if present, or inlined where used.

Keep styles surgical: don't restyle unrelated sections when editing. The dashboard is utilitarian by design — dense info, no animations, no marketing polish.

## Accessibility

No explicit WCAG level targeted — it's a developer tool. Keep basics sane:

- Semantic HTML (`<table>` for tabular data, `<button>` for actions, `<a>` for links)
- Visible focus states
- Color contrast sufficient for status dots (green/amber/red must be distinguishable by more than color alone — use shape, label, or hatching)

## Testing

**No automated browser tests.** Verification is manual:

1. Run the pipeline locally (`npm start`) to populate `public/feeds/`.
2. Open `public/index.html` in a browser.
3. Visually confirm the changed surface renders correctly.
4. For security-sensitive edits (anything touching URL handling, DOM rendering, or user-controlled content), add an explicit note to the PR describing what was checked.

If browser tests ever become necessary, introducing them is a separate project decision — don't add a test framework as part of an unrelated change.
