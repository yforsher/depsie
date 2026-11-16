# Proposal

## Why

The accounts and saved reports in Parts 4 to 6 need new tables, but today the only table
(`events`) was created by hand from `server/sql/schema.sql` in the Neon SQL editor. Schema
changes need to be reviewable, repeatable on any database, tested in CI and applied before the
code that needs them is deployed, so this part adds that path before any new table exists.

## What Changes

- Add Drizzle ORM and drizzle-kit on top of the existing Neon HTTP driver.
- Describe the existing `events` table in a Drizzle schema. The first migration creates it on an
  empty database and leaves the live table unchanged.
- Add `db:generate` and `db:migrate` scripts. Every schema change is a generated SQL migration
  committed with its pull request; no `drizzle-kit push`, no hand changes on the production
  branch, no down migrations.
- CI: each pull request creates a Neon branch, runs the migrations on it, runs the tests against
  it, and deletes the branch whether the tests pass or fail.
- Deploy: a `cloudbuild.yaml` builds the image, runs the migrations on production, then deploys;
  a failed migration stops the deploy.
- Local development and tests use PGlite (in-process Postgres) with the same migrations.
- Analytics inserts move to Drizzle. **BREAKING** (setup only): `server/sql/schema.sql` is
  removed; a new database is set up with `pnpm db:migrate` instead of the SQL editor.

## Capabilities

### New Capabilities

- `database-migrations`: how the database schema is defined, changed, tested and applied to
  production.

### Modified Capabilities

None. Analytics records the same fields and behaves the same; only its storage code changes.

## Impact

- Code: `server/src/analytics.ts` (inserts through Drizzle), new `server/src/db/` (schema,
  client, migrate script), `server/drizzle/` (migrations), `server/src/app.test.ts` (analytics
  tests on PGlite instead of a mocked driver).
- Dependencies: `drizzle-orm` (server), `drizzle-kit` and `@electric-sql/pglite` (server dev).
- CI: `.github/workflows/ci.yml` gets a Neon branch per pull request; needs a Neon API key and
  project ID as GitHub secrets.
- Deploy: new `cloudbuild.yaml`; the Cloud Build trigger is switched from the generated build to
  this file, and its service account needs access to the `DATABASE_URL` secret.
- Docs: README setup and privacy sections, `.env.example`, `server/AGENTS.md`,
  `docs/hosting.md`.
