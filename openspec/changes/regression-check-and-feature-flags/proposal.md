# Proposal

## Why

Parts 3 to 7 change the database, add accounts and store reports. Nothing today checks the
whole anonymous flow in a browser, so a change could break it while unit tests pass. New
features also need a way to ship hidden until they are useful. Part 2 of `docs/plan-platform.md`
adds both before any of that work starts.

## What Changes

- End-to-end smoke test (Playwright) of the anonymous flow as it works today: the form with a
  pasted package.json and its "what is sent" preview, the form without package.json, and a
  report.
  - In CI it runs on every push against the built client and the server with every outside call
    (npm, deps.dev, OSV, GitHub, jsDelivr, OpenRouter) answered from the recorded responses in
    `server/src/fixtures/`.
  - A manual GitHub Actions workflow runs the same test against the live URL with one real
    report.
- The plan also lists "the export", but the app has no export today: the Markdown download
  moved to Part 6. The smoke test covers what exists, and Part 6 adds the export to it.
- Feature flags in one server module:
  - `FEATURE_<NAME>` environment variables, off unless set to `on`. `.env.example` sets them
    on, so local development has them on and production has them off.
  - Routes behind an off flag return 404.
  - `GET /api/features` lists the enabled flags.
  - The client shows no UI for a flag that is off.
  - The flags are `report-links` and `accounts`. No route or UI uses them yet.
- `AGENTS.md` gets two rules: no regressions (run the smoke test in CI and against the live URL
  after each deploy and before turning a flag on), and new features stay behind a flag.
- The OpenSpec apply guidance (`openspec/config.yaml`), prepared earlier, ships with this change.

## Capabilities

### New Capabilities

- `feature-flags`: how a feature is turned on or off per environment, what the server and client
  do for a flag that is off, and how the client learns which flags are on.

### Modified Capabilities

None.

## Impact

- New dev dependency `@playwright/test` at the repo root; Chromium is installed in CI only.
- New: `playwright.config.ts`, `e2e/smoke.spec.ts`, a server entry for the e2e run with the
  outside calls answered from fixtures, `.github/workflows/smoke-live.yml`.
- `server/src/fixtures.ts` is split so the fixture routing works outside Vitest.
- `.github/workflows/ci.yml`: an e2e job.
- Server: a flags module, `GET /api/features`. Client: a hook that reads the flags. Shared: the
  flag names and the response type.
- `.env.example`, `AGENTS.md`, `server/AGENTS.md`, `client/AGENTS.md`.
- The live run makes one real report per run: about $0.002, one of the 10 reports per hour
  allowed for the runner's IP, and one row in analytics.
