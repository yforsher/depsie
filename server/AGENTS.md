# Server

Node, Express, TypeScript, Zod for input validation. Tests with Vitest and Supertest.

The server is the only place that holds API keys (`OPENROUTER_API_KEY`, `GITHUB_TOKEN`,
`DATABASE_URL` in `.env`, never in the repo) and talks to outside services.

## Endpoints

- `GET /api/health` returns `{ status: "ok" }`.
- `GET /api/features` returns the flags on for the caller and whether sign-in exists,
  `{ enabled: Feature[], signIn: boolean }`.
- `/api/auth/*` (Better Auth: GitHub sign-in, sign-out, delete account) and `GET /api/me` (the
  signed-in user, or `null`: not 401, which browsers log as a console error) exist only while
  `accounts` is not off.
- `POST /api/report` is the only report endpoint. It validates `{ need, framework, dependencies? }`
  with Zod (with input size limits), then runs the whole pipeline and returns the report. There is
  no endpoint per stage, so clients cannot trigger AI call 2 with their own candidate list.
- `POST /api/report` has an hourly rate limit (per signed-in user, else per IP) and daily AI cost
  caps (per user, and one shared by all anonymous use) to keep costs predictable.
- In production, Express also serves the built client (`client/dist`) with SPA fallback.

## AI usage

OpenRouter with structured JSON output, validated with Zod. Model: `openai/gpt-6-luna`. At most
two AI calls per request and no retries: invalid model output or an OpenRouter error returns 502
with a clear message.

1. Query expansion: turn the need and framework into npm search keywords and candidate names. When
   provided, include the filtered public dependency names and declared version ranges as context.
2. Grounded comparison: send only fetched public package data and READMEs. Ask for ranking, pros
   and cons per package, a summary of why rank 1 suits the need, rejected alternatives, and security and compliance per package. Data sources and fetch
   dates are added in code from the fetched data, not by the model.

Every evidence reference in the model output (pros, cons and the summary) must point to a field fetched for that
report; output with any other reference is rejected. Security facts are written by code; the model
only picks their status.

## Data sources

Every endpoint was verified by hand; response shapes and a real traced run are in
`docs/endpoints.md`.

| Source                                                 | Used for                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| npm registry search (`registry.npmjs.org/-/v1/search`) | Finding candidates by keyword                                                                       |
| npm registry package metadata                          | Versions, release dates, license, maintainers, dependencies, peer dependencies, types, size, README |
| npm downloads API (`api.npmjs.org/downloads`)          | Weekly downloads                                                                                    |
| jsDelivr (`cdn.jsdelivr.net/npm`)                      | README.md from the published files, when npm's metadata has none                                    |
| deps.dev API (Google Open Source Insights)             | Total dependency count, open issues, OpenSSF Scorecard                                              |
| OSV.dev API                                            | Known vulnerabilities per version                                                                   |
| GitHub REST API (token needed for higher rate limits)  | Stars, last push and archived flag (one call per package)                                           |

A failed source (for example a GitHub rate limit) marks its fields as unavailable instead of
failing the request.

## Storage

- All package data is fetched on every request; nothing is cached.
- User input and reports are never stored.
- Anonymous analytics go to one `events` table in Neon Postgres (`src/db/schema.ts`). The
  `production` branch is production, the `dev` branch is for local runs. Only the columns in that
  file are written.
- `ai_usage` (`src/db/schema.ts`): one row per AI call, with the signed-in user or none; the cost
  caps read only this table. It is separate from `events`, which is never linked to users.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate`, and commit the generated
  migration in `drizzle/` with the pull request. Never `drizzle-kit push`, never change the
  `production` branch by hand. Migrations only go forward: no down migrations; a mistake is
  fixed with a new migration, and an applied migration is never edited. They must work with the
  code still running: add first, remove in a later deploy. The one exception is the first
  migration, edited once before it was ever applied to `CREATE TABLE IF NOT EXISTS`, so it
  records the hand-made `events` table on `production` and `dev` without changing it.
- CI: on each pull request, the `db` job in `.github/workflows/ci.yml` creates the Neon branch
  `pr-<number>` from `production`, runs `db:migrate` and the server tests on it, and deletes it
  however the job ends. It needs `NEON_API_KEY` (secret) and `NEON_PROJECT_ID` (variable). The
  `check` job runs `db:generate` and fails if it leaves changes in `drizzle/`, so a schema edit
  without its committed migration cannot merge.
- Tests use PGlite (in-process Postgres) built from the same migrations: no network, no running
  service, a fresh database per test file. Chosen over a Neon branch per developer (needs network
  and a branch per run) and Postgres in Docker (a container to start before every test run). The Neon
  driver itself is tested by `src/db/client.test.ts`, which runs only when `DATABASE_URL` is set.

## Code structure

- `src/app.ts`: `createApp()` builds the Express app without listening, so tests need no port.
  It takes the client build directory and serves it with SPA fallback; unknown `/api/` paths
  return 404.
- `src/index.ts`: entry point; listens on `PORT` (default 3000) and serves `client/dist`.
- `src/features.ts`: feature flags. The names are `features` in `shared/`; `FEATURE_<NAME>=on`
  (dashes as underscores) turns one on, and unset, empty or `off` leaves it off, so production is off
  unless set and `.env.example` turns them on for local development. Any other value of
  `FEATURE_ACCOUNTS` is a comma-separated list of GitHub logins (any case): on only for those
  signed-in users. To test sign-in on the live URL, set `FEATURE_ACCOUNTS=<your login>` on Cloud
  Run and open `/signin` (no button is shown). `readFlags()` reads them once at startup;
  `enabledFor(flags, login)` answers for one caller. Put a route behind a flag by registering it
  in `createApp()` only when the flag is not off: while it is off the route does not exist and
  gets the same 404 as an unknown API path, however it is mounted. Routes of signed-in users also
  take `requireAccounts`, which gives that same 404 to anyone the flag is not on for.
- `src/auth.ts`: `createAuth()` builds Better Auth (Drizzle adapter, no transactions: user-owned
  rows reference `user.id` with `ON DELETE CASCADE`, so one delete removes a user's data). GitHub
  only, scope `user:email` (name, login and avatar are public profile data, readable with any
  token); `getUserInfo` reads `/user` and `/user/emails`, keeps
  the verified primary email and the login (`githubLogin`), and returns null for a login the
  `accounts` list does not include, so no user or session is created. Account hooks clear the
  GitHub tokens before the row is written: Depsie stores none. `/update-user` is disabled, since
  `githubLogin` decides the flag; the profile is refreshed at each sign-in. A session hook clears
  the IP address and User-Agent Better Auth would store with each session. Settings: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Tests pass Better Auth's `testUtils` plugin to
  create users and sessions directly.
- `src/users.ts`: `loadUser(auth)` puts the session's user in `res.locals.user` (the only source of
  the user: never an id from the request), forwards the renewed session cookie Better Auth sends
  when it extends a session, and answers 503 when the session cannot be read (database down).
- `src/log.ts`: `log()` prints one line prefixed with the request ID, kept in an
  `AsyncLocalStorage` set by the `requestLogging` middleware on `POST /api/report`, so pipeline
  code can log without passing the ID around. Lines: request received, each AI call (duration,
  tokens, cost), data fetched (failed sources), the failed step and reason, response sent (status,
  total duration). Never the need text or dependency names.
- `src/analytics.ts`: records a `visit` when the app shell is served and a `report` row when a
  `POST /api/report` response finishes (any status, including 400 and 429), with the framework,
  and no tokens or cost: those are only in `ai_usage`, where they would otherwise let a
  signed-in user's calls be matched to this anonymous row (its old token and cost columns are
  no longer written and are dropped in Part 5). The visitor is
  a SHA-256 hash of the IP with a salt kept in memory and replaced each UTC day; country comes
  from `geoip-country` (bundled GeoLite2 data, no outside call). Writes go through `db()` from
  `src/db/client.ts` (Drizzle on the Neon HTTP driver), are not awaited and only log on failure,
  so analytics never delay or fail a response.
- `src/db/`: `schema.ts` (Drizzle tables), `client.ts` (`db()`, created on first use so a
  missing `DATABASE_URL` fails that query, not server start; `openDatabase()`, awaited by
  `index.ts` at startup, builds an in-memory PGlite with the migrations when
  `DATABASE_URL=memory`, for local runs and the e2e server, which sets it when unset; PGlite is a
  dev dependency imported only there), `migrations.ts` (the `drizzle/` folder path) and
  `migrate.ts` (applies pending migrations in one transaction over the Neon WebSocket pool; run by
  `pnpm db:migrate` and, compiled, by the deploy). Migrations are in `drizzle/`, generated by
  `pnpm db:generate` from `drizzle.config.ts`.
- `src/openrouter.ts`: `MODEL` (the one place the model ID is set; the optional `OPENROUTER_MODEL`
  env variable overrides it for model comparison runs only) and `chatJson()`, which sends a
  Zod schema as JSON Schema and validates the answer with it. Output is capped at 8,000 tokens and both calls share
  one 90 second deadline for the whole report (`AbortSignal` from `generateReport()`), so a slow
  report ends with a clear 502 instead of leaving the user waiting; the log line names the provider that answered. Failures throw `AiError`, which
  carries the step name (`query_expansion` or `comparison`).
- `src/candidates.ts`: `findCandidates()`, AI call 1. Model-named packages are resolved to their
  latest version (unknown names dropped), npm search results fill the rest, at most 5 returned.
  Each npm request times out after 10 seconds; a failed or timed out request throws `NpmError`,
  which the report endpoint maps to 502 with its message, since there is no report without
  candidates.
- `src/sources.ts`: one fetcher per outside source, each with a 10 second timeout. Fetchers
  throw on any failure.
- `src/packageData.ts`: `fetchPackageData()` runs the fetchers for one candidate and merges the
  results into `PackageData`: one group per source with `source`, `url` (the API called), `page`
  (the web page for the same data, from `pages` in `sources.ts`), `fetchedAt` and either `data` or
  `unavailable` (the reason). A failed source never fails the request. The report links to
  `page`, never to the API response.
- `src/report.ts`: `compareCandidates()`, AI call 2, and `generateReport()`, the whole pipeline.
  The prompt holds each package's source groups (data, or `unavailable` with the reason) with
  READMEs cut to 4,000 characters. The model cites `package` and `field` (`group.key`, for
  example `npm.license`); each reference is checked against those same fields, and source and
  fetch date are filled in from `PackageData`. Unknown packages or fields throw one `AiError`
  listing all of them. Every security fact is written by code from its fetched field (`codeFacts()`);
  the model only picks the status of license, dependency count and release activity, and a failed
  source shows as `unavailable` with no status. Each entry carries its GitHub repository page and its npm description (no AI), and
  the data sources list has one entry per source that returned data, with its earliest fetch
  date. A ranked entry needs at least one pro and a rejected one at least one con (schema), a ranking
  needs a summary, and every
  fetched package must be ranked or rejected exactly once and have a security summary; otherwise
  an `AiError` lists what is missing or repeated.
- `AiError` carries the raw model output when the answer was rejected (not JSON, schema mismatch,
  invalid references).
- `trust proxy` is `1`: the host's proxy (Cloud Run, see `docs/hosting.md`) appends the client IP
  to `X-Forwarded-For`, so `req.ip` (used by the rate limit and analytics) is its last entry and a
  client cannot fake it.
- `POST /api/report` in `src/app.ts`: rate limited to 10 per hour per signed-in user, else per IP
  (429), then the daily cost cap (`checkCostCap`), Zod validation (400), then `generateReport()`; `AiError` becomes 502
  with the message, and the rejected model output is logged to the console (never stored) so
  failures can be investigated.
- `src/limits.ts`: every limit on reports as a constant (reports per hour, the daily AI cost cap of
  $0.25 per signed-in user and $1 shared by all anonymous use) and `checkCostCap`, which sums
  today's (UTC) `ai_usage.cost` for the user, or for all anonymous use, before any AI call: 429 at
  or above the cap, 503 when the database cannot be reached, so no report runs unchecked.
  `loadUser` also answers 503 when the session cannot be read.
- `src/usage.ts`: `recordAiUsage()`, called by `chatJson()` as soon as OpenRouter reports the
  usage (so a rejected answer still counts), writes one `ai_usage` row per AI call (source is the
  step name, model, tokens, cost, and the UTC day only, not the time, so a user's calls cannot be
  matched by time to the anonymous `events` rows); not awaited and only logged on failure. The
  user comes from its own AsyncLocalStorage (`usageUser`), separate from analytics, so `events`
  never sees a user.
- `src/fixtures/`: trimmed real responses. `src/fixtureResponses.ts` serves them by URL, builds
  a valid AI call 2 answer, and has `fakeFetch()`, which answers every outside call of a whole
  report (each AI call by the schema name it asks for). `src/fixtures.ts` re-exports it and adds
  `mockSources()`, the only part that needs Vitest. All three are excluded from the build.
- `src/e2e.ts`: the server for the Playwright smoke test (`e2e/` at the repo root). It replaces
  `fetch` with `fakeFetch()` and starts `index.ts`, so the real server runs with no keys and no
  outside calls. `pnpm --filter server e2e` runs it on `PORT`; excluded from the build.
- The request schema (`reportRequestSchema`) lives in `shared/` and is used by both client and
  server.
- `.env` is loaded from the repo root with Node's `--env-file-if-exists` flag (see `package.json`
  scripts); it is optional.
- Tests sit next to the code as `*.test.ts`. Endpoint tests use Supertest against `createApp()`;
  outside calls are mocked by stubbing `fetch`.
