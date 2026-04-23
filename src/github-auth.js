// GitHub API request headers. Sets Accept for the v3 JSON media type and
// attaches Authorization when GITHUB_TOKEN is present. Caller passes the
// returned object as the `headers` option of fetchSource / fetchWithRetry.
export function githubHeaders() {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}
