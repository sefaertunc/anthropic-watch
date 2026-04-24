# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Scope

anthropic-watch is a read-only scraper that fetches public web pages and APIs. It does not handle user authentication, store credentials, or process user input. The primary security considerations are:

- **GITHUB_TOKEN exposure** — used for GitHub API access and Pages deployment. Scoped to the repository and provided automatically by GitHub Actions.
- **Dependency vulnerabilities** — third-party packages (cheerio, fast-xml-parser) could introduce vulnerabilities.
- **Feed injection** — a compromised source could inject malicious content into published feeds. Feeds are plain text (titles, snippets) and do not render HTML.

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
