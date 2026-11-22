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

Reports need a database, for the daily AI cost caps. Set `DATABASE_URL=memory` in `.env` for an
in-memory database built at startup (empty on every start), or a Neon Postgres connection string:
create its tables once, and after each new migration, with `pnpm --filter server db:migrate`.

To run the built app, as in production:

```sh
pnpm build
pnpm --filter server start   # http://localhost:3000
```

## Privacy

The server stores anonymous usage counts only: visits and reports with the time, country,
framework and status. Unique visitors per day come from a hash of the IP with a
salt that is replaced daily and never stored. No cookies, no IP addresses, and never the need text,
dependency names or the report. To enforce daily cost limits, the tokens and cost of each AI call
are stored with the day only, not the time. Signing in with GitHub, where available, stores your
GitHub name, login, avatar and email and sets a session cookie; no GitHub token and no IP address
are kept, and deleting the account deletes all of it. See `server/src/db/schema.ts`.

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

## Release

`pnpm ship -m "message"` lints, tests, commits all changes, pushes, opens a pull request if there
is none and waits for its checks. It never merges.

`pnpm release [number]` merges the pull request once every check passed (or picks up one merged on
GitHub), then waits for the deploy and its smoke test and says whether the release is live.

## License

MIT. See `LICENSE`.
