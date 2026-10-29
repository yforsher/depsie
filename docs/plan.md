# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Finished parts move to `plan-done.md` (Parts 1 to 11 so far), with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

## Part 12: Model comparison

After the Part 9 fixes, `openai/gpt-oss-120b` still ranks inconsistently (`qrcode.react` versus
`react-qr-code` first for the same need), rates the same release date warning in one run and
danger in another, writes bare facts as pros, puts field paths in cons and adds judgements to
summaries. Some answers also ran on for 13,000 to 23,000 tokens until the Part 9 limits ended
them. Compare it with stronger models before adding more prompt rules.

Time and cost also depend on the provider OpenRouter picks for each request, since none is
requested. AI call 2 is about 80% of a report (19s of 24s on 2026-10-29; the data fetch takes
about 1s) and produces about 2,500 tokens every time, yet it took 5.1s on Crusoe, 19 to 20s on
Parasail, 44.0s on DekaLLM and 73.5s on Near AI. Parasail charged $0.0024 for it, about 3 times
the $0.0007 measured earlier.

- [ ] Choose one or two candidate models with the user, from OpenRouter models that support
      strict structured output, with their price per report
- [ ] Make the model configurable for the comparison runs only (production keeps one fixed model)
- [ ] Pick 3 sample needs, including the QR code need ("A React component to generate QR codes
      for rendering to the DOM.", React)
- [ ] Run each need 3 times on each model and save the outputs outside the repo
- [ ] Compare per model: rejected or failed runs, whether rank 1 stays the same across runs,
      whether the same fact gets the same status, rule breaks (pros that only restate a shown
      fact, field paths, status words, judgements the data does not show), time and cost per report
- [ ] Record the provider of every run, and compare time and cost per provider as well as per
      model
- [ ] Check the OpenRouter docs for provider routing (preferring speed or price, or naming the
      providers), then test it on the chosen model: whether report time becomes steady and cost
      stays low
- [ ] Choose the model and provider settings with the user and record the results and the choice
      in the `AGENTS.md` model section

Tests: none new; the existing tests pass with the chosen model and provider settings.

Success criteria: the user picks a model and provider settings from measured results on the same
needs, and the decision, its typical report time and its cost are recorded in `AGENTS.md`.

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
