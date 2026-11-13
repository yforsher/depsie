# Depsie

Helps developers pick the right npm package: describe the need, pick a framework, and get a ranked
comparison of candidates grounded in fetched public data.

Live at https://depsie.cloud.run

An LLM finds the candidates, then compares and ranks them using only public data fetched for each
report, citing that data for its claims.

## How it is built

I plan each part, make the design decisions and review the result; Claude Code writes most of the
code. Each part has tests and success criteria, and the measurements and decisions behind finished
parts are in `docs/plan-mvp.md`.

## Run

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env   # then fill in the keys
pnpm dev
```

Analytics are written to a Neon Postgres database: create the table once by running
`server/sql/schema.sql` in the Neon SQL editor. Without `DATABASE_URL` the app still works and
logs each failed analytics write.

To run the built app, as in production:

```sh
pnpm build
pnpm --filter server start   # http://localhost:3000
```

## Privacy

The server stores anonymous usage counts only: visits and reports with the time, country,
framework, status, and AI tokens and cost. Unique visitors per day come from a hash of the IP with a
salt that is replaced daily and never stored. No cookies, no IP addresses, and never the need text,
dependency names or the report. See `server/sql/schema.sql`.

## Test

```sh
pnpm lint
pnpm test
```

Smoke test in a browser (Playwright), with npm, OSV and the AI answered from recorded responses.
It builds the app and starts the server on port 3100 (run `pnpm exec playwright install chromium`
once first). A server already listening on 3100 is reused without a build, so stop it first or
the run tests old code:

```sh
pnpm e2e
```

Against a deployment, with real data and one real report: `BASE_URL=https://... pnpm e2e`.

## License

MIT. See `LICENSE`.
