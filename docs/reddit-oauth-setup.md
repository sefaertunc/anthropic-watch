# Reddit OAuth setup for anthropic-watch

Reference for registering this project's Reddit script-app and satisfying the
[Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
application review (Reddit's November 2025 replacement for self-service API
key issuance). Use these field values when submitting the Developer Support
application.

Stated review turnaround is ~7 days.

## App registration

| Field                                          | Value                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| App name                                       | `anthropic-watch`                                                                |
| App type                                       | `script` (read-only; no posting, voting, commenting, messaging, or write action) |
| Developer Reddit username                      | `/u/sefaertunc`                                                                  |
| Primary contact email                          | `sefaertnc@gmail.com`                                                            |
| Source code / project URL                      | `https://github.com/sefaertunc/anthropic-watch`                                  |
| Redirect URI (required, unused by script apps) | `http://localhost:8080`                                                          |

## Use case

anthropic-watch is an open-source, non-commercial monitoring pipeline that
tracks official Anthropic sources (blog, docs, status page, public GitHub
repos, npm releases) and five Anthropic-focused subreddits. It publishes a
daily RSS/JSON/OPML feed to GitHub Pages so developers can subscribe to a
single consolidated feed instead of polling 17 sources manually. No data is
resold, monetized, or used to train models.

The API access need is read-only post listings from five public subreddits,
once per day. OAuth 2.0 client_credentials is used because Reddit's
datacenter-IP filter on anonymous endpoints blocks GitHub Actions runners —
OAuth is the sanctioned path for this exact workload.

## Subreddits accessed

All public, Anthropic-focused communities:

- r/ClaudeCode
- r/ClaudeAI
- r/claude
- r/claudeskills
- r/Claudeopus

## Endpoints used

Listing endpoints only. No user data, no private messages, no moderation
actions, no write endpoints:

- `GET https://oauth.reddit.com/r/<subreddit>/top.json?limit=<n>&t=day` (4 subs)
- `GET https://oauth.reddit.com/r/<subreddit>/new.json?limit=10` (r/Claudeopus)
- `POST https://www.reddit.com/api/v1/access_token` (OAuth token mint)

## Request volume

- 1 token mint + 5 listing requests per pipeline run
- Pipeline runs once per day on a GitHub Actions cron (`0 6 * * *` UTC)
- Total: ~6 requests per day, three orders of magnitude below the 100 QPM
  per-client quota
- No burst traffic, no retries beyond a single 401 token refresh
- No user-authenticated flows; strictly client_credentials

## Data handling

- Only public post metadata is read: `id`, `title`, `permalink`, `selftext`
  (truncated to 300 chars for snippet), `created_utc`, `score`, `stickied`.
- Post IDs and titles are persisted in a public state file
  (`state/last-seen.json`) to deduplicate across runs. No user PII (authors,
  IP addresses) is stored.
- Published feeds link back to the original Reddit permalink — traffic is
  driven to Reddit, not away from it.
- No data is sold, shared with third parties, used for ML training, or
  retained beyond what's needed for deduplication.
- Feed output is static files on GitHub Pages; no backend database.

## Responsible Builder Policy compliance

- **Rate limits:** 6 req/day is ~0.004 QPM, three orders of magnitude below
  the 100 QPM quota.
- **User-Agent:** descriptive UA with contact info, per Reddit guidance:
  `sefaertunc/anthropic-watch:v<version> (by /u/sefaertunc)`.
- **No write operations:** script app is used exclusively for reads.
- **No circumvention:** `x-ratelimit-*` headers are respected; graceful skip
  on 401/403; one bounded retry on stale tokens.
- **Source transparency:** implementation is MIT-licensed and public at the
  repo URL above — reviewable end-to-end.
- **Attribution:** every feed item links to the original Reddit thread.
- **No redistribution of full post content:** snippets are truncated to 300
  chars; users must click through to Reddit to read more.

## Credentials handling post-approval

`client_id` and `client_secret` are stored as GitHub Actions repository
secrets named `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`, scoped to a
single workflow. They are not committed to source, exported, or shared.
