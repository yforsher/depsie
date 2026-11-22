# Platform plan

The MVP (`plan-mvp.md`) built a public, anonymous tool. This plan makes Depsie a product for
signed-in developers: product requirements, accounts, saved reports with links, history and
refresh, a smoke test before each release, and observability. The agents plan (`plan-agents.md`) builds on
it.

Rules:

- One part at a time; the agent checks off substeps and does not start the next part until the
  success criteria pass and the user approves.
- Anonymous use needs no account, as today.
- Permissions, limits and data rules are enforced in code, never by the model.
- The `events` analytics table stays anonymous: never linked to users or reports. Per-user numbers
  come from the account tables.
- Existing functionality keeps working after every part: all existing tests and the smoke test
  pass, in CI and against the new revision before it gets traffic. A test changes only when the behavior
  change is intended, and the commit says why.
- A new feature stays hidden behind a feature flag until it gives the user value on its own (for
  example, signing in shows nothing until saved reports and history exist). Turning a flag on is
  the user's decision, recorded in this file with the date; the flag is removed in a later small
  change once the feature is on and working.
- Finished parts stay in this file, checked off, with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.
- Part 6 includes the Markdown download left over from the MVP.

Feature flags in this plan:

| Flag           | Hides                                                                                      | Turned on                                                         |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `report-links` | saving anonymous reports and their links, and the matching privacy note                    | on since 2026-11-18 (after Part 5)                                |
| `accounts`     | sign-in, saved reports of signed-in users, their share links, history, refresh, usage page | after Part 6, when a signed-in user has saved reports and history |

## Part 1: Product requirements

- [x] `docs/product.md`: who uses Depsie (a developer choosing a package, with or without an
      account), the main use cases, and a measurable goal for each (for example: time to a
      decision, reports refreshed or refined instead of re-run, reports opened again or shared)
- [x] Update `AGENTS.md`: business requirements, out of scope list and privacy constraints for
      the platform and agents plans (accounts, saved reports, share links, chat). The MVP rule "no
      storage of user input or generated reports, and no shareable reports" is replaced by the
      decisions below; the package.json rules (filtered in the browser) stay
- [x] Map each part of this plan to the use case it serves
- [x] Record these decisions in `docs/product.md`:
  - Every report is saved and deleted after a retention period: 10 days for an anonymous report
    without a link and 30 days for one with a link, counted from its creation; 100 days for a
    report of a signed-in user, counted from its latest version. The periods are constants in one
    place, easy to change
  - Anonymous reports get a share link only when the user creates one with a button; anyone with
    the link can open it, and the report can be deleted earlier from the link. They are read-only
    (no chat, no refresh, no new versions)
  - Reports of signed-in users are private; the user can delete them earlier, and deleting the
    account deletes them. The owner can create a read-only share link and revoke it
  - No teams and no package policy; see Later

Tests: none.

Success criteria: the user approves `docs/product.md` and the updated `AGENTS.md`.

## Part 2: Regression check and feature flags

- [x] End-to-end smoke test (Playwright) of the anonymous flow as it works today: the form with and
      without package.json, a report, the export. In CI it runs against the built server with the
      recorded responses in `server/src/fixtures/` instead of live npm and AI calls
- [x] The same smoke test against the live URL with one real report, from a manual GitHub Actions
      workflow; run it after every deploy and before turning a flag on
- [x] Feature flags in one module: each flag is set by an environment variable (`FEATURE_<NAME>`),
      `off` by default in production and `on` in local development; the server returns 404 for
      routes behind a flag that is off and lists the enabled flags in `GET /api/features`; the
      client shows no UI for a flag that is off
- [x] Add the two rules above (no regressions, flags) to `AGENTS.md`

Tests: the flags are read from the environment and listed by `GET /api/features`; the client
hides the UI of a flag that is off. A flagged route is registered only when its flag is on, and
no route is flagged yet, so "a route behind a flag returns 404 when off" is tested in Part 4.

Success criteria: the smoke test passes in CI and against the live URL.

Done 2026-11-13 (PR #9): the `e2e` job passes in CI (2 tests, about 40 seconds), and "Smoke live"
passed against the deployed version (2 tests in 35 seconds, one real report). Both flags are off
in production (`GET /api/features` returns `{"enabled":[]}`).

## Part 3: Drizzle ORM and migrations

- [x] Drizzle ORM and drizzle-kit on top of the existing Neon driver
- [x] Describe the existing `events` table in a Drizzle schema; the first migration matches
      `server/sql/schema.sql` with no change to the live table
- [x] `db:generate` and `db:migrate` scripts; every schema change is a generated SQL migration
      committed with the pull request; never `drizzle-kit push` and never by hand on `main`
- [x] CI on each pull request: create a Neon branch, run the migrations on it, run the tests
      against it, and delete the branch also when the tests fail (the free plan limits the number
      of branches)
- [x] Deploy after merge: deploys run through Cloud Build continuous deployment
      (`docs/hosting.md`), so add a `cloudbuild.yaml` with build, migrate on production, then
      deploy; a failed migration stops the deploy
- [x] Migrations must work with the code that is still running: add first, remove in a later
      deploy; no down migrations, a mistake is fixed with a new migration
- [x] Local development and tests database: choose between a Neon branch per developer, Postgres
      in Docker or PGlite, by test speed and closeness to production; record the choice in
      `server/AGENTS.md`
- [x] Move analytics inserts to Drizzle; remove `server/sql/schema.sql` and update every reference
      to it: the `.env.example` comment, the README setup step (run `pnpm db:migrate` instead of
      the SQL file in the Neon SQL editor) and privacy section, `server/AGENTS.md`, and the
      comments in `server/src/analytics.ts` and `server/src/app.test.ts` (point to the Drizzle
      schema)

Tests: analytics insert test against the Drizzle client.

Success criteria: a fresh Neon branch built only from migrations matches production; a pull
request with a schema change runs its migration on its own Neon branch in CI; after merge, the
migration runs before the new revision is deployed, and analytics still writes rows on the live
URL.

Done 2026-11-16 (PR #11, fix in PR #12): a fresh database built only from migrations has the same
`events` schema as production (columns, identity, defaults, constraints). The `db` job runs the
migrations and the server tests on Neon branch `pr-<number>` (about 30 seconds) and deletes it,
also when a test fails; the `check` job fails when the schema changes without its migration. The
deploy runs Build, Push, Migrate (3 seconds), Deploy (about 2 minutes in all); production recorded
one migration and kept its 66 `events` rows, "Smoke live" passed (2 tests in 35 seconds), and the
run added two visits and one report row. Tests use PGlite (`server/AGENTS.md`). The Neon
production branch is named `production`. The first run of the switched trigger failed at Push:
Cloud Build expands `$_A/$B` to the first variable only, so substitutions need braces.

## Part 4: Accounts and limits

- [x] Check first and record the answers here:
  - Does the Better Auth Drizzle adapter, or deleting a report with its versions, need
    interactive transactions, which the Neon HTTP driver does not support (if so, use the Neon
    WebSocket driver)?
  - Better Auth stores the GitHub access token in the `account` table by default, and Depsie does
    not need it after sign-in: can it be left unstored, or else encrypted?
  - Answers (2026-11-16, Better Auth 1.7): the Drizzle adapter uses interactive transactions only
    with `transaction: true`, so the Neon HTTP driver works; deleting a user (and in Part 5 a
    report with its versions) needs no transaction, since every user-owned table references
    `user.id` with `ON DELETE CASCADE`. The token is not stored: account database hooks clear
    the access, refresh and ID tokens before the row is written.
- [x] Two GitHub OAuth apps, one for local development and one for production (each has one
      callback URL); the GitHub client secret and `BETTER_AUTH_SECRET` in Secret Manager
- [x] Better Auth with its Drizzle adapter: sign in with GitHub, requesting only the `user:email`
      scope (name, login and avatar are public; no private profile data, no repository access;
      `read:user` dropped on 2026-11-16, see Part 4's change). Sign-in never asks for
      repository permissions; if repository access is ever needed, it belongs to a separate GitHub
      App installed on repositories the user picks (agents plan, Later)
- [x] Sign-in page: one line on what Depsie reads (name, avatar, email) and that it has no access
      to repositories, that access can be revoked in GitHub settings, and a link to the privacy
      note; anonymous use stays available
- [x] Auth handler mounted before `express.json()`; httpOnly, secure, SameSite=Lax session cookie
- [x] `GET /api/me` returns the user, or `null` without a session (not 401, which browsers log as a
      console error on every visit; changed 2026-11-16)
- [x] Every user-owned table has `user_id`; every query takes it from the session, never from the
      request
- [x] Client router (TanStack Router, alongside TanStack Query) for the pages added from here on;
      the server already returns the app shell for every non-API path
- [x] Client: sign in and out, the user's avatar; anonymous flow unchanged
- [x] Sign-in and everything a signed-in user sees are behind the `accounts` flag (the anonymous
      limits are not). A flag can also be a comma-separated list of GitHub logins: on only for
      those signed-in users. While `accounts` is a list, `/signin` works only for listed logins and
      no sign-in button is shown, so the feature can be tested on the live URL
- [x] Table `ai_usage` (user_id, source, model, tokens, cost, day): every AI
      call writes one row, including chat turns that change nothing; `user_id` is empty for
      anonymous use. The cost caps and the usage page read only this table
- [x] Limits, as constants in one place, tuned later from the usage page (Part 8):
  - Signed-in: 10 reports per hour per user instead of per IP (refresh counts), and a daily AI
    cost cap of $0.25 per user
  - Anonymous: 10 reports per hour per IP, as today, and a shared daily AI cost cap of $1 for all
    anonymous use
  - A backstop outside the code: a small prepaid OpenRouter balance with auto top-up off (chosen
    2026-11-16), or a credit limit on the API key
- [x] Delete account: removes the user, their sessions and all their reports and share links

Tests: the sign-in and account routes return 404 while `accounts` is off and work when it is on
(the first flagged routes, see Part 2); `/api/me` is `null` without a session; the anonymous report
endpoint still works; every AI call writes an `ai_usage` row; the per-user limit and each cost
cap reject the next request; deleting an account removes all its data. "User A gets 404 for
any report of user B" moves to Part 5 ("a signed-in report is 404 for other users"), where the
first user-owned endpoint appears, as Part 2 moved its 404 test.

Success criteria: with `accounts` set to the user's login on the live URL, sign in and out work
and a second account cannot see the first account's reports; other visitors see no change; the
GitHub consent screen lists only read access to email addresses.

Done 2026-11-16 (PR #14): the deploy ran Migrate (4 seconds, four new migrations) and production
kept its 70 `events` rows. With `accounts` off, "Smoke live" passed (2 tests in 47 seconds); its
report wrote two `ai_usage` rows with no user ($0.0029 together) and a report row in `events`
without tokens or cost, and `GET /api/features` returns `{"enabled":[],"signIn":false}`. With
`FEATURE_ACCOUNTS=yforsher` on `https://depsie.cloud.run`: an anonymous visitor got no sign-in
button and a 404 from `/api/me`; the consent screen listed only email addresses; sign-in created
one user row with scope `user:email` and no GitHub tokens; the session cookie was HttpOnly (Secure
is required by its `__Secure-` prefix; SameSite=Lax is tested, and the live state cookie showed
it); sign-out removed the session. A refused second account was not tried live, for lack of a
second GitHub account; `server/src/auth.test.ts` covers it. "A second account cannot see the
first account's reports" moves to Part 5 with the reports. The flag was set back to `off` the same
day. The OpenRouter backstop is a prepaid balance of about $10 with auto top-up off, not a key
credit limit.

## Part 5: Saved reports and links

- [x] Drop `events.prompt_tokens`, `completion_tokens` and `cost`: no longer written since Part 4
      (AI usage lives only in `ai_usage`, so `events` cannot be linked to a user), and no running
      revision writes them by then
- [x] Tables `reports` (id, user_id, share_id, need, framework, dependencies, expires_at,
      created_at) and `report_versions` (report_id, version, schema_version, report, source,
      created_at), with tokens and cost in `ai_usage`, which gets a `report_id` column here;
      `source` is `pipeline`, `refresh`, `chat` or `agent`, and every change appends a version
- [x] `schema_version` is the version of the shared report schema the report was saved with; on
      read, older versions are converted in code to the current schema, or shown read-only with a
      note when conversion is not possible
- [x] `share_id`: random, at least 128 bits, base64url; a report with a `share_id` opens read-only
      at `/s/:share_id` with no sign-in. Share pages are `noindex` and send
      `Referrer-Policy: no-referrer`, and show the latest version
- [x] Retention periods as constants in one module: anonymous without a link 10 days, anonymous
      with a link 30 days, each counted from the report's `created_at`; signed-in 100 days,
      counted from the latest version, so a refresh or chat version restarts it. `expires_at` is
      set from them when the report is saved, when a version is appended and when an anonymous
      link is created
- [x] Signed-in reports: saved to the user, private, `expires_at` 100 days ahead; open at
      `/reports/:id` for the owner only. The owner can create a share link (copy button) and
      revoke it, which clears `share_id`; a new link gets a new id
- [x] Anonymous reports: saved with no user and `expires_at` 10 days ahead; the result has a
      button to create a share link, which sets `share_id` and moves `expires_at` to 30 days after
      `created_at`, then shows the link with a copy button and the deletion date; the link page
      has a delete button
- [x] Expired reports return 404 on read, whether or not they are deleted yet
- [x] Daily cleanup: a Cloud Run job (`pnpm cleanup`) started by Cloud Scheduler deletes expired
      reports and their versions; no public endpoint
- [x] Update the privacy note: what is stored for anonymous and signed-in use, for how long, who
      can open it, and how to delete it or revoke a link; that a session cookie is set only after
      signing in and is needed for it to work (the note says today that there are no cookies)

Tests: each kind of report gets the `expires_at` of its retention period, and creating an
anonymous link moves it from 10 to 30 days, and a new version of a signed-in report moves it to
100 days from now; an anonymous report opens by its link and returns 404
after `expires_at`; the cleanup
deletes only expired reports; delete by link works; a signed-in report is 404 for other users and
at `/s/` until shared; a revoked link returns 404 and a new link works; a report saved with an
older schema version still opens.

Success criteria: an anonymous report link and a signed-in share link open in another browser
without signing in; after revoking, the old link returns 404; a cleanup run on the live database
deletes an expired test report.

Done 2026-11-18 (PR #16): the deploy ran Migrate (4 seconds, migrations 0005 and 0006) and
production kept its `events` rows (111) without the token and cost columns. Dropping them lost the
old revision's analytics writes for about 64 seconds, between Migrate and the new revision serving
(accepted: Drizzle names every schema column in an insert, so a two-step drop is not possible). With
both flags off, "Smoke live" passed (2 tests in 37 seconds) and its report was not saved: no
`reports` rows, and its two `ai_usage` rows had no report id. The Cloud Run job `depsie-cleanup`
and its paused Cloud Scheduler trigger were created before the merge (the deploy's last step
updates the job image); a manual run logged `deleted 0 expired reports`, and the 03:00 UTC
trigger was resumed. With `report-links` on and `accounts` set to the user's login: an anonymous
report saved with no user for 10 days; its link (the same id when asked twice) moved retention to
30 days and opened in a fresh browser without signing in, with `noindex` and `no-referrer` and no
report id; a signed-in share link opened the same way, read-only with no delete button, and
returned 404 after the user revoked it. A cleanup run deleted an expired test report and its version
(its `expires_at` set in the past by hand, with the user's approval); its link returned 404 before
the run. `report-links` stays on from 2026-11-18; `accounts` was set back to `off`. Follow-up
PR #17 clarified the share controls text before a link exists.

## Part 6: History, freshness and export

- [x] Reports page: the user's reports, open in the existing `ReportView`, version list, share
      link state, delete
- [x] Freshness: every report shows when its data was fetched and how long ago, compared with the
      time it is viewed; after 7 days (one shared constant) a warning says that releases and
      vulnerabilities may have changed since then
- [x] Refresh, for the signed-in owner only: runs the pipeline again with the saved need,
      framework and dependencies and appends a version with source `refresh`; older versions stay
      viewable. It counts toward the per-user limit and cost cap. On an anonymous or shared report,
      the warning suggests signing in or running a new report
- [x] Markdown download built in code from the structured report (the old Part 15), including the
      fetch date

Tests: the freshness function at 0, 6, 7 and 30 days; refresh appends a version with the same
inputs; refresh returns 401 without a session and 404 for another user's report; Markdown snapshot
contains every report section and the fetch date.

Success criteria: the reports page lists the user's reports; a report older than 7 days shows the
warning, and refreshing it creates version 2 with today's fetch date, which the share link then
shows; the downloaded Markdown matches the screen.

Done 2026-11-18 (PR #19): the deploy needed no migration. With `accounts` off, "Smoke live" passed
(2 tests in 52 seconds), and anonymous visitors got the fetch date line and the Markdown download.
With `FEATURE_ACCOUNTS=yforsher`: the reports page listed the user's reports; a new test report's
fetch date and version date were set 8 days back by hand (with the user's approval), and it showed
"8 days ago" and the old-data warning with Refresh. Refresh appended version 2 with source
`refresh`, today's fetch date and a deletion date 100 days ahead; its share link, opened without a
session, showed version 2, not deletable and without the report id; version 1 still opened,
marked earlier, with the warning and no Refresh. The Markdown (`depsie-2026-11-18.md`) had every
package, fact, pro and con on screen and each source's fetch date. Deleting from the report page
returned to `/reports` without it, and the report and its link returned 404. The two runs wrote
four `ai_usage` rows ($0.0043). `accounts` was set back to `off`.

## Part 7: Smoke test before release

Today the deploy sends all traffic to the new revision at once, and "Smoke live" runs only after
that, by hand, when users can already reach it. CI cannot catch what exists only in production
(real npm and OpenRouter answers, Cloud Run settings, secrets, the production database). Here the
new revision is smoke-tested first and gets traffic only if it passes.

- [ ] Check first and record the answers here: how Cloud Run serves a revision deployed with
      `--no-traffic --tag` (its URL, and that it reads the same secrets and database), whether a
      Cloud Build step can run Playwright (the official Playwright image, or GitHub Actions called
      from Cloud Build), how long the extra steps add to a deploy, and what the smoke run costs
      (one real report, about $0.002 per deploy)

  Answers (2026-11-22):
  - Tag URL: `https://<tag>---<service host>` ([Cloud Run rollouts](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)),
    so the candidate is `https://candidate---depsie-kud34vyt4q-ew.a.run.app`, as in design.md.
  - Settings: `gcloud run services describe depsie` shows secrets (`OPENROUTER_API_KEY`,
    `DATABASE_URL`, `GITHUB_*`, `BETTER_AUTH_SECRET`), variables and `maxScale: 1` on the revision
    template, which `services update --no-traffic` copies into the candidate.
  - Scaling: a tagged revision outside the traffic split is started and does not count toward the
    service-level maximum (20); the lower of revision and service maximum applies, so the
    candidate gets its own one instance ([max instances](https://docs.cloud.google.com/run/docs/configuring/max-instances)).
  - Build duration: the last 8 builds took 2:08 to 3:08. The default build timeout is 60 minutes,
    not 10 ([config schema](https://docs.cloud.google.com/build/docs/build-config-file-schema));
    builds already run with `timeout: 3600s`.
  - One build at a time: no trigger setting for it (trigger and config docs cover only
    `queueTtl` and approval); the risk stays as accepted in design.md.
  - Smoke share: in the last 28 days `events` has 26 reports and 128 visits; the trigger ran 24
    builds (21 succeeded), and 22 of the 37 `master` commits touched app files. So smoke reports
    may be about half of all reports. Kept, and told apart when reading the data (user's
    decision): a smoke run writes 2 visits and 1 `React` report with country `US` inside the
    build's Smoke step; country alone is not enough (7 earlier `US` reports, mostly "Smoke live").
  - Smoke step on its own (`gcloud builds submit`, Playwright image): against the live URL,
    build `56276c8b` passed in 2:01 (tests 57s); against `https://example.com`, build `5f9a179c`
    failed in 5:15 naming both tests in `e2e/smoke.spec.ts`. The image has Node 26 and no
    Corepack (Corepack's npm package collides with the image's `yarn`), so the step installs the
    pnpm version named in `packageManager` with npm. `gcloud builds submit` needed
    `roles/storage.objectViewer` for the compute service account on the `_cloudbuild` bucket.
  - First gated deploy (PR #21, build `4230ccac`, 2026-11-22): all 7 steps passed in 4:45, Smoke
    ran 2 tests in 50 seconds against the candidate, Promote gave `depsie-00038-sov` all traffic,
    and the service template and the cleanup job run the merge commit's image.

- [ ] `cloudbuild.yaml`: Deploy creates the new revision with no traffic and the tag `candidate`;
      a new Smoke step runs `pnpm e2e` with `BASE_URL` set to the candidate URL; a new Promote step
      moves all traffic to it only after Smoke passes. A failed smoke ends the build, the previous
      revision keeps serving, and the build log names the failed test. Update cleanup job runs
      after Promote, so the job never runs code that did not pass
- [ ] Migrations still run before the candidate, so they must keep working with the revision still
      serving (the existing rule: add first, remove in a later deploy). Record that a failed smoke
      leaves the migration applied, and that this is safe only under that rule
- [ ] Turning a flag on goes the same way: a new revision with the changed variable, no traffic,
      smoke-tested at its tag, then promoted. Write the commands in `docs/hosting.md`
- [ ] The smoke run's report and visit are recorded like any other anonymous use (analytics and
      `ai_usage`); check that this is acceptable or exclude them in code, with evidence either way
- [ ] Rollback by hand: the command that sends all traffic back to the previous revision, in
      `docs/hosting.md`, tried once on the live service
- [ ] Update the "Smoke live" workflow and the workflow rules in `AGENTS.md`: the deploy now runs
      the smoke test itself; the manual workflow stays for checking the live URL at any time

Tests: a deploy whose smoke test fails (for example a candidate built to fail one assertion, on a
test service or by hand) leaves all traffic on the previous revision; a passing deploy moves all
traffic to the new one.

Success criteria: a merged pull request reaches users only after the smoke test passed against its
own revision, and a failing one never does; rolling back by hand takes one command.

## Part 8: Observability and usage

- [ ] Structured logs with a request id across all paths
- [ ] OpenTelemetry traces exported to Cloud Trace: one span per pipeline stage, external call and
      AI call, with tokens and cost as attributes. Check how spans are exported when Cloud Run
      allocates CPU only during requests (`docs/hosting.md`): spans sent after the response may be
      lost, so flush before the response ends or change the setting, with evidence either way
- [ ] Usage page for the signed-in user: reports, tokens and cost per day, from `ai_usage` (not
      from `events`), with the daily cost cap from Part 4

Tests: the request id appears in every log line of a report request.

Success criteria: for any report id, the trace shows every stage with its time and cost.

## Later

Not planned; recorded so the design does not block it.

- Teams: a shared space for reports, with roles and invitations. Reports would move from `user_id`
  to an owner that can be a user or a team, through an additive migration
- Package policy, to consider together with teams: rules a team sets for acceptable packages
  (allowed licenses, blocked packages, maximum vulnerability severity), checked in code rather
  than by the model, and used by a pull request check (agents plan, Later)
- Pull request previews and a merge queue, when a second regular developer joins: each pull
  request deployed privately with a Neon copy of production and smoke-tested before merge, so a
  failed smoke test never reaches `master` and blocks the others; a merge queue so concurrent
  merges do not race for the `candidate` tag or force every open branch to re-run. Builds on
  Part 7: the candidate, the smoke gate and the rollback stay as the last check against the real
  database. Limits to solve then: Neon free plan branches, no secrets for pull requests from forks
