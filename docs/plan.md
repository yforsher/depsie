# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Finished parts move to `plan-done.md` (Parts 1 to 12 so far), with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

## Part 13: Production deployment

- [x] Choose a host with the user, comparing free tier and paid options; check its request timeout
      fits a report of about 30 seconds. Chosen: Google Cloud Run (300 second default timeout, max
      1 instance, instance-based billing); Neon stays the database. Settings in `docs/hosting.md`
- [ ] Set `OPENROUTER_API_KEY`, `GITHUB_TOKEN` and `DATABASE_URL` (the Neon `main` branch, already
      in the local `.env` as `DATABASE_URL_PROD`; its `events` table exists) as host secrets
      (Secret Manager), never in the repo; a budget alert in Cloud Billing
- [ ] Build and start commands; `/api/health` as the host health check. Root `start` script added
      (`node server/dist/index.js`); a clean `pnpm build` then `pnpm start` serves `/api/health`
      and the client locally. Root `Dockerfile` added, since the buildpack image had no server
      packages. Left: confirm the first Dockerfile deploy, and the startup probe on `/api/health`
- [x] Set Express `trust proxy` to match the host's proxy, so the rate limit and the analytics
      country use the real client IP and a user cannot fake it with a header. Set to `1`: Google's
      front end appends the client IP as the last `X-Forwarded-For` entry. Confirm on the live URL
      that a spoofed `X-Forwarded-For` does not change the rate limit
- [x] One 90 second deadline shared by both AI calls (replaces the 120 second per-call timeout),
      so a slow report gets a clear 502 instead of leaving the user waiting
- [x] Timeout on the npm search, which has none today, so a stuck call returns a clear error
      instead of hanging until the host cuts the request (the OpenRouter calls got theirs in Part 9).
      10 seconds, like the other sources; a failed npm request now returns 502 with its message
      instead of Express's default 500
- [ ] Spending cap on the OpenRouter key in the OpenRouter dashboard, as a hard cost limit across
      all IPs
- [x] `LICENSE` file (MIT unless the user chooses otherwise). MIT, copyright 2026 Jonas
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
