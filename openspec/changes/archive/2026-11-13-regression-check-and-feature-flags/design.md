# Design

## Context

See proposal.md for why. What exists today:

- Server tests stub `fetch` with `server/src/fixtures.ts`, which routes each outside URL to a
  recorded response in `server/src/fixtures/` and builds a valid AI call 2 answer
  (`comparison()`) for the fixture package `@hookform/resolvers`. It imports `vi` from Vitest,
  so it cannot run in a normal server process, and it is excluded from the build.
- `app.test.ts` already runs the whole pipeline on fixtures: AI call 1 names
  `@hookform/resolvers` with no keywords (no npm search), AI call 2 returns `comparison()`.
- The server is one Express app from `createApp(clientDir)`. The Cloud Run image sets no
  `NODE_ENV`.
- The client has no export today; the Markdown download is in Part 6.

## Goals / Non-Goals

**Goals:**

- One smoke test file that runs unchanged against the CI server (fixtures) and the live URL.
- The flags mechanism in place, with tests, so Parts 4 and 5 only register a route when its flag
  is on and add `useFeature(...)` to a component.

**Non-Goals:**

- No route or UI is put behind a flag in this change.
- No flag values other than `on` and off; the GitHub login list is Part 4.
- One browser (Chromium) only.

## Decisions

**Fixtures for the e2e server, without Vitest.** Move everything in `server/src/fixtures.ts`
except `mockSources()` (the only part that uses `vi`) into `server/src/fixtureResponses.ts`, and
re-export it from `fixtures.ts`, so no test import changes. Add `fakeFetch(url)` there: it
answers OpenRouter with the same two answers as `app.test.ts` (the expansion or `comparison()`,
picked by the schema name the call asks for, so reports that overlap in time stay correct) and
every other URL with `sourceResponse()`. A new entry
`server/src/e2e.ts` sets `globalThis.fetch = fakeFetch` and then imports `index.ts`, so the
server code is the real one and only its outside calls are replaced. Both new files are excluded
from the build like `fixtures.ts`, so none of them is compiled or run in production.

- Run with `tsx server/src/e2e.ts` on port 3100 (dev uses 3000), serving the built
  `client/dist`. The server code runs from source, not `server/dist`; the code is the same and
  the fixture files never enter the build.
- Alternative: mock `/api/report` in the browser with Playwright `page.route`. Rejected because
  the server, its validation and its pipeline would not be tested.
- Alternative: a local HTTP server that imitates npm and OpenRouter, with the outside URLs made
  configurable. Rejected: it adds URL settings to production code only for tests.

**Playwright at the repo root.** `@playwright/test` as a root dev dependency,
`playwright.config.ts` at the root and tests in `e2e/`. A root script `pnpm e2e` runs
`playwright test`.

- `BASE_URL` unset: `webServer` runs `pnpm build` and the e2e entry, waits for
  `http://localhost:3100/api/health`, and uses that as `baseURL`. `reuseExistingServer` is on
  except in CI, as the Playwright docs recommend.
- `BASE_URL` set (live run): no `webServer`, tests run against that URL.
- `playwright-report/` and `test-results/` are git- and Prettier-ignored.

**What the smoke test checks.** It asserts what any report has, so it passes for the fixture
package and for a live report:

1. Form with a pasted package.json holding a public dependency, a scoped package outside the
   allowlist and a `git+ssh:` dependency: the preview lists the public one as sent and the
   other two as not sent, with their reasons. No report is requested.
2. Form without package.json: fill in need and framework, submit, and see a report with the
   "Why <name>" summary, a card marked Recommended and the data sources section.

So a live run costs one report. The test also fails on any console error in the page.

**CI.** A second job, `e2e`, in `ci.yml`, next to `check`: install, `pnpm exec playwright install
--with-deps chromium`, `pnpm e2e`. A separate job keeps lint and unit test failures visible on
their own and runs both in parallel.

**Live run.** `.github/workflows/smoke-live.yml` with `workflow_dispatch` and a `url` input whose
default is the live URL (the one in `uptime.yml`), running `pnpm e2e` with `BASE_URL` set. It is
run by hand after each deploy and before turning a flag on; `AGENTS.md` states the rule.
Deploys run in Cloud Build, outside GitHub Actions, so no workflow trigger fits.

**Flags on the server.** `server/src/features.ts`:

- The flag names are a constant in `shared/` (`features = ['report-links', 'accounts']`), with
  the `Feature` type and the `FeaturesResponse` type (`{ enabled: Feature[] }`), since the
  client uses them too.
- `enabledFeatures(env)` returns the flags whose `FEATURE_<NAME>` is `on`. `createApp()` reads
  it once from `process.env` at startup; the variables do not change while the server runs.
- A flagged route is registered in `createApp()` only when its flag is on, so while it is off
  the route does not exist and gets the same 404 as any unknown API path, however it is mounted.
  The first version used `requireFeature()` middleware calling `next('route')`; review showed
  that Express honors `'route'` only inside `app.METHOD` routes, so with `app.use` or a Router
  the flagged handler still ran while the flag was off (reproduced with a failing test). Part 4's
  per-login flags will need a per-request check; that part designs it.
- `GET /api/features` returns `{ enabled }`. It is not rate limited and records no analytics.

Alternative: default on when `NODE_ENV` is not `production`. Rejected because the image sets no
`NODE_ENV`, and an explicit `on` in `.env` is visible where the other local settings are.
`.env.example` lists both flags as `on`.

**Flags in the client.** `fetchFeatures()` in `src/api.ts`, and `useFeature(name)` in
`src/features.ts`: a TanStack Query for `GET /api/features`, fetched once per page load
(`staleTime: Infinity`), that returns `true` only when the list includes the name. Pending or
failed returns `false`, so flagged UI never flashes and a failed call cannot break the form.

**Tests.**

- `server/src/features.test.ts`: `enabledFeatures()` for `on`, unset and other values;
  `GET /api/features` on `createApp()` with `vi.stubEnv`. No route is flagged yet, so "a route
  behind a flag returns 404 when off and works when on" is tested in Part 4 with the first real
  flagged routes; a made-up route here would only test Express.
- `client/src/features.test.tsx`: a test component behind `useFeature('accounts')` is hidden
  when the list does not include it, while it loads and when the call fails, and shown when it
  does.

## Risks / Trade-offs

- [The live run uses one real report and one of the runner IP's 10 reports per hour] → It is
  started by hand and makes a single report.
- [Shared GitHub runner IPs could already be rate limited on the live URL] → The test then fails
  with the 429 message on screen, which says so; run it again later.
- [The e2e server runs from source with `tsx`, not from `server/dist`] → The same TypeScript is
  compiled either way, and the e2e run starts with `pnpm build`, which also type-checks and
  builds the server.
- [Fixture data can drift from the real APIs] → The live run checks real data after each deploy.
