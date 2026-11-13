# Tasks

## 1. Feature flags on the server

- [x] 1.1 Add the flag names, `Feature` and `FeaturesResponse` to `shared/src/index.ts`; verify `pnpm --filter shared test` and `pnpm build` pass
- [x] 1.2 Add `server/src/features.ts` with `enabledFeatures(env)`, test first in `server/src/features.test.ts` (`on`, unset, other values); verify the tests pass. Flagged routes are registered only when their flag is on (see design.md); the 404-when-off test moves to Part 4 with the first flagged route
- [x] 1.3 Add `GET /api/features` to `createApp()`, test first (one flag on, none on, via `vi.stubEnv`); verify `pnpm --filter server test` passes with every existing test unchanged
- [x] 1.4 Add `FEATURE_REPORT_LINKS=on` and `FEATURE_ACCOUNTS=on` to `.env.example` and document the flags module and endpoint in `server/AGENTS.md`; verify `pnpm dev` with that `.env` returns both flags from `/api/features`

## 2. Feature flags in the client

- [x] 2.1 Add `fetchFeatures()` to `client/src/api.ts` and `useFeature(name)` in `client/src/features.ts`, test first in `client/src/features.test.tsx` (hidden when off, while loading and on failure; shown when on); verify `pnpm --filter client test` passes
- [x] 2.2 Document `useFeature` in `client/AGENTS.md`; verify the code structure section names the new files

## 3. Smoke test in CI

- [x] 3.1 Move the Vitest-free parts of `server/src/fixtures.ts` into `server/src/fixtureResponses.ts`, re-exported from `fixtures.ts`, and add `fakeFetch()`; verify `pnpm --filter server test` passes with no test import changed
- [x] 3.2 Add `server/src/e2e.ts` (replaces `fetch` with `fakeFetch`, then starts the server on `PORT`), exclude both new files from the server build; verify a report from `POST /api/report` on the running e2e server returns the fixture package, and `server/dist` has neither file after `pnpm build`
- [x] 3.3 Add `@playwright/test`, `playwright.config.ts` (webServer on port 3100 when `BASE_URL` is unset), the `pnpm e2e` script and the ignores for `playwright-report/` and `test-results/`; verify `pnpm e2e` starts the server and runs with no tests
- [x] 3.4 Write `e2e/smoke.spec.ts` (package.json preview; a report from need and framework; no console errors); verify `pnpm e2e` passes locally, and fails when the report view is broken on purpose
- [x] 3.5 Add the `e2e` job to `.github/workflows/ci.yml`; verify it passes on the pull request
- [x] 3.6 Document the e2e entry and fixtures in `server/AGENTS.md` and `pnpm e2e` in the README test section; verify both name the commands as they run

## 4. Smoke test against the live URL

- [x] 4.1 Add `.github/workflows/smoke-live.yml` (manual, `url` input defaulting to the live URL, `pnpm e2e` with `BASE_URL`); verify `BASE_URL=<live URL> pnpm e2e` passes locally with one real report
- [x] 4.2 Add to `AGENTS.md` the rules on regressions (smoke test in CI and against the live URL after each deploy and before turning a flag on) and on feature flags; verify they match the rules in `docs/plan-platform.md`

## 5. Integration

- [x] 5.1 Run `pnpm lint`, `pnpm test` and `pnpm e2e`; verify all pass and show the output

## Workflow follow-up

- After merge and deploy, run the live smoke workflow from GitHub Actions (Part 2 success criterion).
- Archive the change, then check off Part 2 in `docs/plan-platform.md`.
