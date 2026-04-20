# Agent Routing Guide

Read this file at the start of every session. It tells you which agents are available and when to use them.

## How Agents Work

- Agents are specialist subprocesses. Spawn them to keep your main context clean.
- Worktree agents run in isolation — safe to run in parallel with your work.
- Non-worktree agents share your context — don't edit the same files they're reading.
- Never spawn more than 3 agents simultaneously.
- If a task is small enough to do yourself in 2 minutes, don't spawn an agent for it.

---

## Automatic Triggers

These agents should be spawned without being asked when their trigger condition is met.

### code-simplifier

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** After a feature is implemented and tests pass. Also when you notice growing complexity or duplication.
- **Trigger:** Automatic — spawn when trigger condition is met (also: /simplify)
- **What it does:** Reviews code for duplication, unnecessary abstraction, missed reuse opportunities. Simplifies without changing behavior.
- **Expect back:** Cleanup commits on worktree branch. Diff review before merge.

### test-writer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** After completing implementation of any feature or module.
- **Trigger:** Automatic — spawn when trigger condition is met
- **What it does:** Writes unit tests, integration tests, edge case tests. Covers happy path, error cases, boundary conditions.
- **Expect back:** Test files committed to worktree branch. Merge when reviewed.

### build-validator

- **Model:** Haiku | **Isolation:** None
- **When:** Before every commit. After merging worktree branches.
- **Trigger:** Automatic — spawn when trigger condition is met
- **What it does:** Quick validation — tests pass, build succeeds, lint clean. Fast and cheap (Haiku model).
- **Expect back:** Pass/fail with specific errors if failed.

---

## Manual Triggers

These agents are spawned when you or the user explicitly requests them.

### plan-reviewer

- **Model:** Opus | **Isolation:** None
- **When:** Before executing any implementation prompt. Always.
- **Trigger:** Manual — /review-plan
- **What it does:** Reviews implementation plans as a senior staff engineer. Challenges assumptions, finds ambiguity, checks verification strategy, identifies missing edge cases.
- **Expect back:** Refined plan with concerns addressed, or list of blocking questions.

### verify-app

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** Before creating a PR. After major changes.
- **Trigger:** Manual — /verify
- **What it does:** Full end-to-end verification. Runs the app, tests all major flows, checks for regressions. More thorough than build-validator.
- **Expect back:** Detailed verification report. Blocking issues listed.

### upstream-watcher

- **Model:** Sonnet | **Isolation:** None
- **When:** At the start of a session to check for upstream Claude Code changes. After Claude Code updates. When behavior seems different from last session.
- **Trigger:** Manual — /upstream-check
- **What it does:** Fetches anthropic-watch feeds, cross-references upstream changes against the project's scaffolded agents/commands/hooks/skills, and produces an impact report.
- **Expect back:** Impact report: which upstream changes affect this project, which are informational, and recommended actions.

### ci-fixer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** CI pipeline fails. Build errors in GitHub Actions/CI. Flaky tests blocking merges.
- **Trigger:** Manual — spawn when needed
- **What it does:** Reads CI logs, identifies root cause, implements fix in worktree isolation.
- **Expect back:** Fix committed to worktree branch with CI passing.

### docker-helper

- **Model:** Sonnet | **Isolation:** None
- **When:** Creating or modifying Dockerfiles. Compose file changes. Multi-stage build optimization. Container debugging.
- **Trigger:** Manual — spawn when needed
- **What it does:** Manages containerization, Dockerfile optimization, compose file configuration, multi-stage builds.
- **Expect back:** Optimized Docker configuration with size/performance improvements.

### deploy-validator

- **Model:** Sonnet | **Isolation:** None
- **When:** Before deploying to staging or production. After infrastructure changes. New environment setup.
- **Trigger:** Manual — spawn when needed
- **What it does:** Validates deployment readiness — environment configs, secrets management, health checks, rollback strategy.
- **Expect back:** Deployment readiness checklist with pass/fail.

### dependency-manager

- **Model:** Haiku | **Isolation:** None
- **When:** After adding new packages. During regular maintenance. When security advisories are published.
- **Trigger:** Manual — spawn when needed
- **What it does:** Audits, updates, and resolves dependency issues. Checks for security vulnerabilities in packages.
- **Expect back:** Dependency audit report with update recommendations.

### bug-fixer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** Bug reported. Test failing. Error in logs. Something broke but you don't want to derail current work.
- **Trigger:** Manual — spawn when needed
- **What it does:** Investigates the bug in isolation. Reads logs, reproduces, finds root cause, implements fix, writes regression test.
- **Expect back:** Fix committed to worktree branch with regression test.

### security-reviewer

- **Model:** Opus | **Isolation:** None
- **When:** Auth changes. User input handling. New API endpoints exposed to external users. Dependency updates.
- **Trigger:** Manual — spawn when needed
- **What it does:** Scans for injection vulnerabilities, auth bypasses, data exposure, insecure defaults, dependency vulnerabilities.
- **Expect back:** Security report with severity ratings.

### performance-auditor

- **Model:** Sonnet | **Isolation:** None
- **When:** Performance concern raised. Slow endpoint discovered. Before releasing to production. After major changes.
- **Trigger:** Manual — spawn when needed
- **What it does:** Profiles code, identifies bottlenecks, checks database query efficiency, measures response times, suggests optimizations.
- **Expect back:** Performance report with benchmarks and recommendations.

### refactorer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** Large-scale renames. Architectural pattern changes. Library migrations. Moving code between modules.
- **Trigger:** Manual — spawn when needed
- **What it does:** Handles large-scale refactoring in worktree isolation. Renames, architectural changes, pattern migrations with full test verification.
- **Expect back:** Refactored code on worktree branch with all tests passing.

### build-fixer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** Build is broken. Tests failing. Lint errors blocking commit. Type errors after a merge or dependency update.
- **Trigger:** Manual — spawn when needed
- **What it does:** Reads error output, categorizes failures (build/test/lint/type), fixes in priority order, verifies each fix. Works in worktree isolation.
- **Expect back:** All checks passing, with a summary of what was fixed and why.

### e2e-runner

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** After implementing user-facing features. Before releases. When unit tests pass but integration is suspect.
- **Trigger:** Manual — spawn when needed
- **What it does:** Writes and runs end-to-end tests for critical user journeys. Detects E2E framework (Playwright/Cypress) or recommends setup. Tests web, API, or CLI flows.
- **Expect back:** E2E test results with pass/fail per journey and reproduction steps for failures.

### doc-writer

- **Model:** Sonnet | **Isolation:** Worktree
- **When:** After implementing new features. After API changes. When README is outdated. Before release.
- **Trigger:** Manual — spawn when needed
- **What it does:** Updates documentation, README, API docs from code changes. Keeps docs in sync with implementation.
- **Expect back:** Updated docs committed to worktree branch.

### changelog-generator

- **Model:** Haiku | **Isolation:** None
- **When:** Before releasing a new version. After merging a batch of PRs. When preparing release notes.
- **Trigger:** Manual — spawn when needed
- **What it does:** Generates changelogs from git history, PR descriptions, and commit messages. Formats for release notes.
- **Expect back:** Formatted changelog entry for the release.

---

## Decision Matrix

| You just...                                    | Spawn this          | Auto?  |
| ---------------------------------------------- | ------------------- | ------ |
| Got an implementation prompt                   | plan-reviewer       | Manual |
| Notice code getting complex                    | code-simplifier     | Yes    |
| Finished implementing a feature                | test-writer         | Yes    |
| Are about to commit                            | build-validator     | Yes    |
| Finished a task, ready for PR                  | verify-app          | Manual |
| Want to check for upstream Claude Code changes | upstream-watcher    | Manual |
| CI pipeline is failing                         | ci-fixer            | Manual |
| Working with Docker or containers              | docker-helper       | Manual |
| Preparing for deployment                       | deploy-validator    | Manual |
| Added new dependencies or running maintenance  | dependency-manager  | Manual |
| Got a bug report mid-task                      | bug-fixer           | Manual |
| Made security-sensitive changes                | security-reviewer   | Manual |
| Suspect performance issues                     | performance-auditor | Manual |
| Need large-scale refactoring                   | refactorer          | Manual |
| Build or tests are broken                      | build-fixer         | Manual |
| Need end-to-end testing of user flows          | e2e-runner          | Manual |
| Need docs updated after implementation         | doc-writer          | Manual |
| Preparing a release                            | changelog-generator | Manual |

---

## Rules

1. Universal agents are your defaults. Use them every session.
2. Project agents are specialists. Use them when their domain is relevant.
3. Worktree agents are safe to run in parallel — they can't break your work.
4. Non-worktree agents share your context — don't edit the same files they're reading.
5. When in doubt, spawn the agent. A wasted agent run costs less than a missed bug.
6. If you spawn an agent and it's not useful, tell the user — they may remove it.
