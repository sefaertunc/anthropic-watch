# AGENTS.md

anthropic-watch — Monitors public Anthropic and community sources daily for changes and publishes structured feeds.

## Tech Stack

- Node.js 20+, plain JavaScript (no TypeScript, no build step)

## Build & Test Commands

```bash
# Node.js
npm test                        # Run tests
npx eslint .                    # Lint
npx prettier --write .          # Format
```

## Code Conventions

- Follow existing patterns in the codebase
- Test before committing
- Read source files before modifying them
- Ask if ambiguous, do not guess

## Project Structure

- `src/` — Source code
- `tests/` — Test files
- `docs/` — Documentation

## Key Principles

- Source of truth: docs/spec/SPEC.md
- One task at a time, verify each before moving on
- Never invent features not in the specification
