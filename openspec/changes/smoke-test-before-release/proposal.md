# Proposal

## Why

Today a merge to `master` sends all traffic to the new revision at once, and "Smoke live" runs only
afterwards, by hand, when users can already reach a broken release. CI cannot catch what exists
only in production: real npm and OpenRouter answers, Cloud Run settings, secrets and the production
database. This is Part 7 of `docs/plan-platform.md`, and it makes every later part safer to ship.

## What Changes

- The Cloud Build deploy creates the new revision with no traffic and the tag `candidate`, runs the
  existing Playwright smoke test (`pnpm e2e`) against the candidate URL automatically, and moves
  all traffic to it only when the smoke test passes. A failed smoke test ends the build; the
  previous revision keeps serving and the build log names the failed test. The candidate is the
  release itself, with the production database, so no second smoke run is needed after promotion.
- The smoke test runs on every deploy, with no opt-out. Merges that change only files outside the
  app (docs, plans, specs, workflow files) do not deploy at all, through the trigger's ignored
  files setting.
- The cleanup job is pointed at the new image only after the traffic moves, so it never runs code
  that did not pass.
- Migrations still run before the candidate. A failed smoke test leaves the migration applied,
  which is safe only under the existing rule (add first, remove in a later deploy); this is
  recorded in `docs/hosting.md`.
- A failed smoke test leaves `master` ahead of what is live; the fix is a revert or a fixing pull
  request, which deploys through the same gate.
- Turning a flag on follows the same path by hand: a no-traffic revision with the changed variable,
  smoke-tested at its tag with the "Smoke live" workflow, then promoted. Commands in
  `docs/hosting.md`.
- Rollback by hand: one command that sends all traffic back to the previous revision, in
  `docs/hosting.md`, tried once on the live service.
- The smoke run's report and visit stay recorded like any other anonymous use (one report and
  about $0.002 per deploy); no code change. They may be about half of all reports, so
  `docs/hosting.md` records how to leave them out when reading the data.
- "Smoke live" stays as a manual workflow for checking any URL; the workflow rules in `AGENTS.md`
  state the release order and that the deploy runs the smoke test itself.
- `pnpm ship` runs the release order up to the merge for a developer without an AI agent: branch,
  lint and test, commit, push, pull request, watch checks. It never merges; merging is a separate
  step, on GitHub or with `pnpm release`, and starts the deploy, smoke test and promotion.
- `pnpm release` merges a pull request whose checks all passed (or picks up one merged on GitHub),
  then watches the deploy's check on the merge commit and reports whether the release is live or
  the smoke test stopped it.
- CI runs once per push to a pull request instead of twice: `push` is limited to `master`, and
  `pull_request` already covers opening a pull request and every later push to it.
- Pull request previews and a merge queue are recorded under Later in `docs/plan-platform.md`, for
  when a second regular developer joins.

## Capabilities

### New Capabilities

- `deployment`: how a release reaches users: the candidate revision, the smoke test gate, the
  promotion, flag changes and rollback.

### Modified Capabilities

None. `database-migrations` already requires migrations before the new revision gets traffic and
forward-compatible schema changes; both stay as written.

## Impact

- `cloudbuild.yaml`: Deploy gains `--no-traffic --tag=candidate`; new Smoke and Promote steps;
  "Update cleanup job" moves after Promote.
- `.github/workflows/smoke-live.yml`: comment only.
- `.github/workflows/ci.yml`: `push` limited to `master`.
- `docs/hosting.md`, `AGENTS.md`, `docs/plan-platform.md`, `docs/plan-agents.md`.
- No application code, no schema migration, no new dependencies. The Smoke step uses the official
  Playwright image matching `@playwright/test` (1.65.0).
