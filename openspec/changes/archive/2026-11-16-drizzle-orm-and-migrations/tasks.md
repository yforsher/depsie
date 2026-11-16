# Tasks

## 1. Drizzle schema and the first migration

- [x] 1.1 Load superpowers:test-driven-development with the Skill tool. Check the current Drizzle docs (Context7), then add `drizzle-orm` to `server` and `drizzle-kit` and `@electric-sql/pglite` as server dev dependencies at their `latest` tags. Load superpowers:verification-before-completion with the Skill tool and run its check: `pnpm install`, `pnpm build` and `pnpm test` pass
- [x] 1.2 Load superpowers:test-driven-development with the Skill tool. Add `server/drizzle.config.ts` and `server/src/db/schema.ts` with the `events` table as in design.md (identity `id`, `at` default `now()`, check named `events_kind_check`), and a `db:generate` script; generate the first migration and add `IF NOT EXISTS` to its `CREATE TABLE`. Load superpowers:verification-before-completion with the Skill tool and run its check: the generated SQL has the same columns, types, defaults and check as `server/sql/schema.sql`, and running `db:generate` again reports no changes

## 2. Migration runner

- [x] 2.1 Load superpowers:test-driven-development with the Skill tool. Test first: a PGlite database with the migrations applied twice has an `events` table with the expected columns and one recorded migration. Then add `server/src/db/migrate.ts` (`drizzle-orm/neon-serverless/migrator`, one transaction; folder resolved from the file's location) and a `db:migrate` script (tsx with the repo `.env`). Load superpowers:verification-before-completion with the Skill tool and run its check: the test passes, and after `pnpm build` `node server/dist/db/migrate.js` finds the migrations folder
- [x] 2.2 Run `pnpm db:migrate` against the Neon `dev` branch, which already has `events`; verify it succeeds, `drizzle.__drizzle_migrations` on `dev` has one row, and the row count of `events` is unchanged

## 3. Analytics through Drizzle

- [x] 3.1 Load superpowers:test-driven-development with the Skill tool. Change the analytics tests in `server/src/app.test.ts` to mock `./db/client.js` with a Drizzle PGlite client that has the migrations applied, and to read rows back from `events` (same expected values as today); see them fail. Then add `server/src/db/client.ts` and move `insert()` in `server/src/analytics.ts` to Drizzle. Load superpowers:verification-before-completion with the Skill tool and run its check: all analytics tests pass with their expectations unchanged, including the failed-write log, and `pnpm test` passes
- [x] 3.2 Load superpowers:test-driven-development with the Skill tool. Add `server/src/db/client.test.ts`, run only when `DATABASE_URL` is set: insert a visit through the real Neon client and read it back. Load superpowers:verification-before-completion with the Skill tool and run its check: it is skipped with no `DATABASE_URL`, and passes with `DATABASE_URL` set to the `dev` branch
- [x] 3.3 Load superpowers:test-driven-development with the Skill tool. Remove `server/sql/schema.sql` and update every reference: the `.env.example` comment, the README setup step (`pnpm db:migrate` instead of the SQL editor) and privacy section, `server/AGENTS.md` (storage, code structure, and the test database choice: PGlite, with why), and the comments in `server/src/analytics.ts` and `server/src/app.test.ts` (point to `src/db/schema.ts`). Load superpowers:verification-before-completion with the Skill tool and run its check: searching the repo for `schema.sql` finds only `docs/plan-platform.md` and `openspec/`, and `pnpm lint` and `pnpm test` pass

## 4. CI on a Neon branch

- [x] 4.1 Load superpowers:test-driven-development with the Skill tool. Check the current docs of `neondatabase/create-branch-action` and `neondatabase/delete-branch-action`, then add the `db` job to `.github/workflows/ci.yml` (pull requests only; branch `pr-<number>` from `production`; `db:migrate`, then the server tests with its `DATABASE_URL`; delete under `if: always()`). Ask the user to add `NEON_API_KEY` as a secret and `NEON_PROJECT_ID` as a variable. Load superpowers:verification-before-completion with the Skill tool and run its check: the job passes on the pull request, `client.test.ts` ran (not skipped) in its log, and the branch is gone from the Neon project afterwards
- [x] 4.2 Load superpowers:test-driven-development with the Skill tool. Prove the cleanup on failure: push a temporary commit with a failing server test. Load superpowers:verification-before-completion with the Skill tool and run its check: the `db` job fails, the delete step ran, the branch is gone; then revert the commit
- [x] 4.3 Document the migration rules in `server/AGENTS.md` (generated migrations only, never `push` or hand changes on `production`, forward only, add first and remove in a later deploy, the one `IF NOT EXISTS` edit in the first migration) and the CI job; verify the rules match `docs/plan-platform.md` Part 3
- [x] 4.4 Load superpowers:test-driven-development with the Skill tool. Add a step to the `check` job that runs `db:generate` and fails when it leaves changes in `server/drizzle/` (a schema edit without its committed migration; added from code review). Load superpowers:verification-before-completion with the Skill tool and run its check: locally the step fails after adding a column to `schema.ts` without generating, and passes on the clean branch; the `check` job passes on the pull request

## 5. Deploy with migrations

- [x] 5.1 Load superpowers:test-driven-development with the Skill tool. Check the current Cloud Build and Cloud Run deploy docs, then add `cloudbuild.yaml`: build, push, run `node server/dist/db/migrate.js` in the image with `DATABASE_URL` from Secret Manager, then `gcloud run deploy` with the same image, keeping the trigger's existing substitutions. Load superpowers:verification-before-completion with the Skill tool and run its check: the first Cloud Build run after merge passes its Migrate step (no local Docker build: a missing file fails that step, which stops the deploy and keeps the previous revision serving)
- [x] 5.2 Document in `docs/hosting.md` the console steps (switch the trigger to `cloudbuild.yaml`; its service account already reads the `DATABASE_URL` secret) and the order build, migrate, deploy; ask the user to do the console steps; verify the trigger shows `cloudbuild.yaml` as its configuration

## 6. Integration

- [x] 6.1 Build a fresh database only from migrations (a new empty database on the `dev` branch, `pnpm db:migrate`) and compare its `events` schema with production (`production`); verify there are no differences, then drop the empty database
- [x] 6.2 After merge, verify the Cloud Build run shows the migrate step before the deploy step, `drizzle.__drizzle_migrations` on `production` has one row and `events` kept its rows, "Smoke live" passes, and a visit to the live URL adds a row to `events`

## 7. Code review

- [x] 7.1 Load superpowers:requesting-code-review with the Skill tool, then reproduce and fix every Critical and Important finding

## Workflow follow-up

- Archive the change with `openspec-archive-change`, then check off Part 3's substeps in `docs/plan-platform.md` and record its measurements there.
