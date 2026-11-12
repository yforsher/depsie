# Platform plan

The MVP (`plan-mvp.md`) built a public, anonymous tool. This plan makes Depsie a product for
signed-in developers: product requirements, accounts, saved reports with links, history and
refresh, and observability. The agents plan (`plan-agents.md`) builds on
it.

Rules:

- One part at a time; the agent checks off substeps and does not start the next part until the
  success criteria pass and the user approves.
- Anonymous use needs no account, as today.
- Permissions, limits and data rules are enforced in code, never by the model.
- The `events` analytics table stays anonymous: never linked to users or reports. Per-user numbers
  come from the account tables.
- Existing functionality keeps working after every part: all existing tests and the smoke test
  pass, in CI and against the live URL after the deploy. A test changes only when the behavior
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
| `report-links` | saving anonymous reports and their links, and the matching privacy note                    | after Part 5, when anonymous links work end to end                |
| `accounts`     | sign-in, saved reports of signed-in users, their share links, history, refresh, usage page | after Part 6, when a signed-in user has saved reports and history |

## Part 1: Product requirements

- [ ] `docs/product.md`: who uses Depsie (a developer choosing a package, with or without an
      account), the main use cases, and a measurable goal for each (for example: time to a
      decision, reports refreshed or refined instead of re-run, reports opened again or shared)
- [ ] Update `AGENTS.md`: business requirements, out of scope list and privacy constraints for
      the platform and agents plans (accounts, saved reports, share links, chat). The MVP rule "no
      storage of user input or generated reports, and no shareable reports" is replaced by the
      decisions below; the package.json rules (filtered in the browser) stay
- [ ] Map each part of this plan to the use case it serves
- [ ] Record these decisions in `docs/product.md`:
  - Anonymous reports are saved with a unique, unguessable link; anyone with the link can open
    it. They are kept for 30 days and then deleted, and can be deleted earlier from the link.
    They are read-only (no chat, no refresh, no new versions)
  - Reports of signed-in users are private and kept until the user deletes them or the account.
    The owner can create a read-only share link and revoke it
  - No teams and no package policy; see Later

Tests: none.

Success criteria: the user approves `docs/product.md` and the updated `AGENTS.md`.

## Part 2: Regression check and feature flags

- [ ] End-to-end smoke test (Playwright) of the anonymous flow as it works today: the form with and
      without package.json, a report, the export. In CI it runs against the built server with the
      recorded responses in `server/src/fixtures/` instead of live npm and AI calls
- [ ] The same smoke test against the live URL with one real report, from a manual GitHub Actions
      workflow; run it after every deploy and before turning a flag on
- [ ] Feature flags in one module: each flag is set by an environment variable (`FEATURE_<NAME>`),
      `off` by default in production and `on` in local development; the server returns 404 for
      routes behind a flag that is off and lists the enabled flags in `GET /api/features`; the
      client shows no UI for a flag that is off
- [ ] Add the two rules above (no regressions, flags) to `AGENTS.md`

Tests: a route behind a flag returns 404 when off and works when on; the client hides the UI of a
flag that is off.

Success criteria: the smoke test passes in CI and against the live URL.

## Part 3: Drizzle ORM and migrations

- [ ] Drizzle ORM and drizzle-kit on top of the existing Neon driver
- [ ] Describe the existing `events` table in a Drizzle schema; the first migration matches
      `server/sql/schema.sql` with no change to the live table
- [ ] `db:generate` and `db:migrate` scripts; every schema change is a generated SQL migration
      committed with the pull request; never `drizzle-kit push` and never by hand on `main`
- [ ] CI on each pull request: create a Neon branch, run the migrations on it, run the tests
      against it, and delete the branch also when the tests fail (the free plan limits the number
      of branches)
- [ ] Deploy after merge: deploys run through Cloud Build continuous deployment
      (`docs/hosting.md`), so add a `cloudbuild.yaml` with build, migrate on production, then
      deploy; a failed migration stops the deploy
- [ ] Migrations must work with the code that is still running: add first, remove in a later
      deploy; no down migrations, a mistake is fixed with a new migration
- [ ] Local development and tests database: choose between a Neon branch per developer, Postgres
      in Docker or PGlite, by test speed and closeness to production; record the choice in
      `server/AGENTS.md`
- [ ] Move analytics inserts to Drizzle; remove `server/sql/schema.sql` and update every reference
      to it: the `.env.example` comment, the README setup step (run `pnpm db:migrate` instead of
      the SQL file in the Neon SQL editor) and privacy section, `server/AGENTS.md`, and the
      comments in `server/src/analytics.ts` and `server/src/app.test.ts` (point to the Drizzle
      schema)

Tests: analytics insert test against the Drizzle client.

Success criteria: a fresh Neon branch built only from migrations matches production; a pull
request with a schema change runs its migration on its own Neon branch in CI; after merge, the
migration runs before the new revision is deployed, and analytics still writes rows on the live
URL.

## Part 4: Accounts and limits

- [ ] Check first and record the answers here:
  - Does the Better Auth Drizzle adapter, or deleting a report with its versions, need
    interactive transactions, which the Neon HTTP driver does not support (if so, use the Neon
    WebSocket driver)?
  - Better Auth stores the GitHub access token in the `account` table by default, and Depsie does
    not need it after sign-in: can it be left unstored, or else encrypted?
- [ ] Two GitHub OAuth apps, one for local development and one for production (each has one
      callback URL); the GitHub client secret and `BETTER_AUTH_SECRET` in Secret Manager
- [ ] Better Auth with its Drizzle adapter: sign in with GitHub, requesting only the `read:user`
      and `user:email` scopes (name, avatar, email; no repository access). Sign-in never asks for
      repository permissions; if repository access is ever needed, it belongs to a separate GitHub
      App installed on repositories the user picks (agents plan, Later)
- [ ] Sign-in page: one line on what Depsie reads (name, avatar, email) and that it has no access
      to repositories, that access can be revoked in GitHub settings, and a link to the privacy
      note; anonymous use stays available
- [ ] Auth handler mounted before `express.json()`; httpOnly, secure, SameSite=Lax session cookie
- [ ] `GET /api/me` returns the user, or 401
- [ ] Every user-owned table has `user_id`; every query takes it from the session, never from the
      request
- [ ] Client router (TanStack Router, alongside TanStack Query) for the pages added from here on;
      the server already returns the app shell for every non-API path
- [ ] Client: sign in and out, the user's avatar; anonymous flow unchanged
- [ ] Sign-in and everything a signed-in user sees are behind the `accounts` flag (the anonymous
      limits are not). A flag can also be a comma-separated list of GitHub logins: on only for
      those signed-in users. While `accounts` is a list, `/signin` works only for listed logins and
      no sign-in button is shown, so the feature can be tested on the live URL
- [ ] Table `ai_usage` (user_id, source, model, tokens, cost, created_at): every AI
      call writes one row, including chat turns that change nothing; `user_id` is empty for
      anonymous use. The cost caps and the usage page read only this table
- [ ] Limits, as constants in one place, tuned later from the usage page (Part 7):
  - Signed-in: 10 reports per hour per user instead of per IP (refresh counts), and a daily AI
    cost cap of $0.25 per user
  - Anonymous: 10 reports per hour per IP, as today, and a shared daily AI cost cap of $1 for all
    anonymous use
  - A credit limit on the OpenRouter API key, set in OpenRouter, as a backstop
- [ ] Delete account: removes the user, their sessions and all their reports and share links

Tests: 401 without a session; user A gets 404 for any report of user B; the anonymous report
endpoint still works; every AI call writes an `ai_usage` row; the per-user limit and each cost
cap reject the next request; deleting an account removes all its data.

Success criteria: with `accounts` set to the user's login on the live URL, sign in and out work
and a second account cannot see the first account's reports; other visitors see no change; the
GitHub consent screen lists only read access to profile and email.

## Part 5: Saved reports and links

- [ ] Tables `reports` (id, user_id, share_id, need, framework, dependencies, expires_at,
      created_at) and `report_versions` (report_id, version, schema_version, report, source,
      created_at), with tokens and cost in `ai_usage`, which gets a `report_id` column here;
      `source` is `pipeline`, `refresh`, `chat` or `agent`, and every change appends a version
- [ ] `schema_version` is the version of the shared report schema the report was saved with; on
      read, older versions are converted in code to the current schema, or shown read-only with a
      note when conversion is not possible
- [ ] `share_id`: random, at least 128 bits, base64url; a report with a `share_id` opens read-only
      at `/s/:share_id` with no sign-in. Share pages are `noindex` and send
      `Referrer-Policy: no-referrer`, and show the latest version
- [ ] Signed-in reports: saved to the user, private, no expiry; open at `/reports/:id` for the
      owner only. The owner can create a share link (copy button) and revoke it, which clears
      `share_id`; a new link gets a new id
- [ ] Anonymous reports: saved with no user, a `share_id` and `expires_at` 30 days ahead; the
      result shows the link with a copy button and the deletion date; the link page has a delete
      button
- [ ] Expired reports return 404 on read, whether or not they are deleted yet
- [ ] Daily cleanup: a Cloud Run job (`pnpm cleanup`) started by Cloud Scheduler deletes expired
      reports and their versions; no public endpoint
- [ ] Update the privacy note: what is stored for anonymous and signed-in use, for how long, who
      can open it, and how to delete it or revoke a link; that a session cookie is set only after
      signing in and is needed for it to work (the note says today that there are no cookies)

Tests: an anonymous report opens by its link and returns 404 after `expires_at`; the cleanup
deletes only expired reports; delete by link works; a signed-in report is 404 for other users and
at `/s/` until shared; a revoked link returns 404 and a new link works; a report saved with an
older schema version still opens.

Success criteria: an anonymous report link and a signed-in share link open in another browser
without signing in; after revoking, the old link returns 404; a cleanup run on the live database
deletes an expired test report.

## Part 6: History, freshness and export

- [ ] Reports page: the user's reports, open in the existing `ReportView`, version list, share
      link state, delete
- [ ] Freshness: every report shows when its data was fetched and how long ago, compared with the
      time it is viewed; after 7 days (one shared constant) a warning says that releases and
      vulnerabilities may have changed since then
- [ ] Refresh, for the signed-in owner only: runs the pipeline again with the saved need,
      framework and dependencies and appends a version with source `refresh`; older versions stay
      viewable. It counts toward the per-user limit and cost cap. On an anonymous or shared report,
      the warning suggests signing in or running a new report
- [ ] Markdown download built in code from the structured report (the old Part 15), including the
      fetch date

Tests: the freshness function at 0, 6, 7 and 30 days; refresh appends a version with the same
inputs; refresh returns 401 without a session and 404 for another user's report; Markdown snapshot
contains every report section and the fetch date.

Success criteria: the reports page lists the user's reports; a report older than 7 days shows the
warning, and refreshing it creates version 2 with today's fetch date, which the share link then
shows; the downloaded Markdown matches the screen.

## Part 7: Observability and usage

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
