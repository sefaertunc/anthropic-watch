# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Scope

anthropic-watch is a read-only scraper that fetches public web pages and APIs. It does not handle user authentication, store credentials, or process user input. The primary security considerations are:

- **GITHUB_TOKEN exposure** — used for GitHub API access and Pages deployment. Scoped to the repository and provided automatically by GitHub Actions.
- **Dependency vulnerabilities** — third-party packages (cheerio, fast-xml-parser) could introduce vulnerabilities. Socket SCA scans run automatically on commits to `main` and `develop`; CVE-bearing transitive packages are flagged in the dashboard and remediated via dependency bumps.
- **Feed injection** — a compromised source could inject malicious content into published feeds. Feeds are plain text (titles, snippets) and do not render HTML.

## Supply-chain trust

The two artifacts this project ships have different verification stories:

- **Client (`@sefaertunc/anthropic-watch-client`)** is published to npm from `.github/workflows/publish-client.yml` running in GitHub Actions with `id-token: write` and `npm publish --provenance --access public`. Consumers can verify the build origin via `npm view @sefaertunc/anthropic-watch-client@<version> dist.signatures` or the **Provenance** badge on the npm package page. The attestation links each tarball to the exact commit and workflow run that produced it. Releases `1.0.0` – `1.0.2` predate this workflow and were uploaded manually without attestation; pin to `>=1.0.3` for a verifiable build chain.
- **Scraper (`anthropic-watch`)** is infrastructure, not a package — distributed only via tagged GitHub Releases (`vX.Y.Z`) created by `.github/workflows/release.yml` on merges to `main`. There is no npm artifact. Consumers trust the GitHub commit + tag pair; verify via `git show v1.5.2` against the source on `main`.

## Reporting a Vulnerability

If you discover a security issue, please report it privately:

- **Email**: sefaertunc@gmail.com
- **Subject line**: `[SECURITY] anthropic-watch: brief description`

Please do **not** open a public GitHub issue for security vulnerabilities.

You can expect:

- **Acknowledgment** within 48 hours
- **Assessment** within 7 days
- **Fix or mitigation** as soon as practical, depending on severity

## Best Practices for Users

If you fork this project or run it on your own infrastructure:

- Never commit secrets or API tokens to the repository
- Use GitHub's built-in `GITHUB_TOKEN` rather than personal access tokens
- Keep dependencies updated (`npm audit` regularly)
- Review scraper output before consuming it in sensitive automation
