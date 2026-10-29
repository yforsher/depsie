# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Finished parts move to `plan-done.md` (Parts 1 to 12 so far), with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

## Part 13: Production deployment

- [ ] Choose a free tier host with the user; check its request timeout fits a report of about 30
      seconds
- [ ] Set `OPENROUTER_API_KEY`, `GITHUB_TOKEN` and `DATABASE_URL` (the Neon `main` branch, already
      in the local `.env` as `DATABASE_URL_PROD`; its `events` table exists) as host secrets, never
      in the repo
- [ ] Build and start commands; `/api/health` as the host health check
- [ ] Set Express `trust proxy` to match the host's proxy, so the rate limit and the analytics
      country use the real client IP and a user cannot fake it with a header
- [ ] Timeout on the npm search, which has none today, so a stuck call returns a clear error
      instead of hanging until the host cuts the request (the OpenRouter calls got theirs in Part 9)
- [ ] Spending cap on the OpenRouter key in the OpenRouter dashboard, as a hard cost limit across
      all IPs
- [ ] `LICENSE` file (MIT unless the user chooses otherwise)
- [ ] Free uptime check on `/api/health` that alerts the user when the site is down
- [ ] Real report on the live URL in the browser

Tests: the rate limit uses the client IP from the proxy header set by the host; a timed out
OpenRouter call returns 502 with a clear message.

Success criteria: the live URL produces a real report end to end; secrets are only in the host
settings; the OpenRouter cap and uptime check are active.

## Part 14: Share report as Markdown download

- [ ] Build Markdown from the structured report in code (no AI call)
- [ ] Download button saves a `.md` file

Tests: Markdown builder snapshot; contains all report sections and the data fetch date.

Success criteria: the downloaded file reads correctly and matches the on-screen report.

## TBD

- Package data cache: dropped for now, since resolving the latest version already fetches the
  metadata and README, AI calls dominate cost and latency, and free hosts often wipe the disk.
  Revisit with an in-memory cache only if npm latency or limits become a problem.
