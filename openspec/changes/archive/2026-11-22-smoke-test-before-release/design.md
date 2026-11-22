# Design

## Context

`cloudbuild.yaml` runs Build, Push, Migrate, Deploy (`gcloud run services update --image`) and
Update cleanup job. The service's traffic is `latestRevision: true, percent: 100`, so each deploy
gets all traffic at once. Scaling is set on the revision template (`maxScale: 1`, `minScale: 0`);
the service-level maximum is 20. `e2e/smoke.spec.ts` (2 tests, one real report) runs against any
`BASE_URL` with no local server; "Smoke live" runs it from GitHub Actions on demand.
`@playwright/test` is 1.65.0. Requirements are in `specs/deployment/spec.md`.

## Goals / Non-Goals

**Goals:**

- Reuse the existing smoke test unchanged, inside the existing Cloud Build pipeline.

**Non-Goals:**

- Smoke-testing pull requests before merge (previews): recorded under Later in
  `docs/plan-platform.md`, for when a second regular developer joins. This design stays useful
  then, as the last check against the real database.
- Gradual rollout (a percentage of traffic first): one instance and little traffic make a full
  switch after a passing smoke test enough.
- Automatic rollback after promotion: the smoke test is the gate; later problems use the manual
  command.

## Decisions

### Pipeline

| Step                 | Change                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Build, Push, Migrate | unchanged                                                                                        |
| Deploy               | adds `--no-traffic --tag=candidate`                                                              |
| Smoke (new)          | Playwright image; installs the root workspace only; `pnpm e2e` with `BASE_URL=${_CANDIDATE_URL}` |
| Promote (new)        | `gcloud run services update-traffic ${_SERVICE_NAME} --to-tags=candidate=100`                    |
| Update cleanup job   | moved after Promote                                                                              |

Cloud Build runs steps in order and stops at the first failure, so a failed Smoke means Promote
and the cleanup update never run. The first `--no-traffic` deploy turns the service's traffic from
"latest" into a fixed revision, and `--to-tags` keeps it fixed, so later `services update` calls
never move traffic by themselves. The build `timeout` stays unset: the default is 60 minutes, far
above a build plus the image pull and one real report.

No smoke run after Promote: the candidate is the same revision, with the same database and
settings, that users get, so a second run would repeat the first.

### No opt-out, but no deploy for non-app changes

Every deploy runs the smoke test: it costs one report and a few minutes, and "small" changes such
as a frontend fix are what breaks a bundle or a route. Instead, the trigger's ignored files skip
the whole build when every changed file is outside the app: `docs/**`, `openspec/**`,
`.github/**`, `.claude/**`, `**/*.md`, `LICENSE`. Files that change the image or the smoke test
(`e2e/**`, `playwright.config.ts`, `cloudbuild.yaml`, lock and config files) are not ignored.

Alternative: a skip flag or path condition inside `cloudbuild.yaml`. Rejected: two release paths,
one of them ungated.

### CI runs once per push

`ci.yml` has `on: push` with no branch filter and `on: pull_request`, so a push to a branch with an
open pull request starts two runs of `check` and `e2e`. Limiting `push` to `master` leaves one run
per push through `pull_request` (types `opened`, `synchronize`, `reopened` by default, with `db`),
and still runs CI on `master` after each merge. A push to a branch with no pull request starts no
CI; `pnpm ship` opens the pull request right after pushing.

### `pnpm ship` for working without an agent

`scripts/ship.mjs` runs the release order up to the merge, so a developer without an AI agent
follows the same steps:

1. On `master`, create a branch named from the message (or `-b <name>`); on a branch, stay.
2. Show the changed files and ask to confirm; stop if there are none.
3. `pnpm lint` and `pnpm test`; stop on failure, before committing.
4. Commit everything with the message and push; open a pull request with `gh pr create --fill`
   only when the branch has none (`gh pr view`), since the push already updates an open one.
5. `gh pr checks --watch`, then print the pull request's URL and whether every check passed.

It never merges: someone merges on GitHub or with `pnpm release`, and that merge starts the deploy, the smoke test on the
candidate and the promotion described above. Node, not a shell script, because
developers may use Windows, macOS or Linux; it needs only `git` and `gh`. The confirmation in step
2 guards against committing files by mistake; `.gitignore` already keeps `.env` out.

Alternative: document the commands only. Rejected: the user asked for a script, and a missed step
(no lint before pushing, a pull request opened twice) is what it prevents.

### `pnpm release` to merge and watch the deploy

Cloud Build already reports each build to GitHub as a check run from the `google-cloud-build` app
on the `master` commit (seen on the current `master` head), so `scripts/release.mjs` watches the
deploy through `gh`, and reads its details with `gcloud`:

1. Find the pull request of the current branch (or `pnpm release <number>`).
2. Not merged yet: stop unless every check passed; then `gh pr merge --squash --delete-branch`.
   Already merged (for example with the GitHub button): skip to watching.
3. Read the merge commit and wait for its `google-cloud-build` check run. None after a few
   minutes: report that no deploy started (only ignored files changed) and stop.
4. Poll until it completes; print each build step with its status and time, the smoke test's
   summary and failing tests, then "live" or "deploy failed" and the build link, so the developer
   never leaves the terminal.
5. Switch the local repository to `master` and pull.

Merging stays a choice the developer makes by running it; `pnpm ship` never merges. The check run
carries only step statuses and a log link (the builds log to Cloud Logging only), so the steps and
the Playwright lines come from `gcloud builds describe` and `gcloud builds log`: `release` needs
`gcloud` signed in to the project, unlike `ship`.

### Candidate URL

A tag's URL is `https://<tag>---<service host>`, so the candidate is always
`https://candidate---depsie-kud34vyt4q-ew.a.run.app`. It goes in a substitution `_CANDIDATE_URL`.
Alternative: read it with `gcloud run services describe` in the Smoke step. Rejected: one more
tool in the Playwright image for a value that does not change.

The candidate URL is public, like the service. Between deploy and promote it serves the code about
to go live anyway; afterwards it points at the live revision.

### Smoke step image

`mcr.microsoft.com/playwright:v1.65.0-noble`, matching `@playwright/test`, has the browsers and
Node 26 without Corepack (and installing Corepack collides with the image's `yarn`), so the step
installs with npm the pnpm version named in the `packageManager` field. Only the root package is
installed (it holds `@playwright/test`); the app is not built, since `BASE_URL` disables the web
server in `playwright.config.ts`. The image tag must follow `@playwright/test` upgrades, noted next
to the step.

Alternative: trigger the "Smoke live" GitHub workflow from Cloud Build and wait for it. Rejected:
needs a GitHub token in Secret Manager and polling, for the same test.

### Promote by tag

`--to-tags=candidate=100` moves traffic to the revision the Smoke step just tested, not to
whatever is latest. Rollback is `update-traffic --to-revisions=<previous>=100`; the previous name
comes from `gcloud run revisions list`.

### Flag changes by hand

`gcloud run services update depsie --update-env-vars=FEATURE_<NAME>=on --no-traffic
--tag=candidate`, then "Smoke live" with the candidate URL (`gh workflow run smoke-live.yml -f
url=...`), then the same `update-traffic --to-tags` as Promote. All three go in `docs/hosting.md`.

### Smoke usage stays recorded

The smoke report goes through the anonymous form like any visitor, so it writes one `events`
report row, a visit, and two `ai_usage` rows. Not excluding it: a marker for smoke traffic could
be sent by anyone. The share is not small: in the 28 days before this change `events` had 26
reports while 22 merges touched the app, so smoke reports may be about half of all reports. They
are told apart when reading the data, not in code: their country is the one Cloud Build's egress
address resolves to and their time matches a build. `docs/hosting.md` records how to leave them
out of a count.

## Risks / Trade-offs

- [A failed smoke leaves `master` ahead of what is live] → A revert or fix pull request deploys
  through the same gate. With one developer nobody else builds on it meanwhile.
- [Two builds overlap and the second moves the `candidate` tag before the first promotes] → Merges
  are rare and one at a time; the check task records whether the trigger can be limited to one
  build at a time.
- [The candidate has its own instance, salt and rate limit] → Only the smoke test uses it; the
  serving revision keeps its own. Revision-level `maxScale: 1` still lets the candidate start.
- [Sign-in fails on the candidate URL (`BETTER_AUTH_URL` is the live URL)] → The smoke test is
  anonymous only, as today.
- [A failed smoke leaves a migration applied] → Safe only under the forward-only rule in
  `database-migrations`; recorded in `docs/hosting.md`.
- [Deploys take longer] → Measured in the check task.

## Migration Plan

Merge, then watch the first build: the Smoke step passes and Promote moves traffic. Try the
failing case once by hand with `gcloud builds submit` and a smoke assertion changed to fail, with
the user's approval. Rollback of this change itself: revert `cloudbuild.yaml`, then set traffic to
`--to-latest` so deploys again send traffic directly.
