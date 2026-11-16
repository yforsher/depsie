# database-migrations Specification

## Purpose

Keeps every database built the same way from reviewed migrations in the repository, and makes
sure a schema change is tested on its own database before review and applied to production
before the code that needs it runs.

## Requirements

### Requirement: The schema is built only from migrations

Every table SHALL be created and changed by SQL migrations committed in the repository. A
database built from an empty state by applying all migrations in order SHALL have the same tables,
columns, types, defaults and constraints as production.

#### Scenario: Fresh database matches production

- **WHEN** all migrations are applied to an empty database
- **THEN** its schema matches the production schema, with no differences

### Requirement: The first migration leaves the live table unchanged

The first migration SHALL create the `events` table as it exists in production on an empty
database, and SHALL succeed without changing anything on a database that already has that table.

#### Scenario: Applied to production

- **WHEN** the first migration runs on the production database, which already has `events`
- **THEN** it succeeds, is recorded as applied, and `events` keeps its columns and rows

#### Scenario: Applied to an empty database

- **WHEN** the first migration runs on an empty database
- **THEN** the `events` table exists with the production columns, defaults and the `kind` check

### Requirement: Schema changes are generated migrations

A schema change SHALL be made by editing the schema definition and generating a SQL migration
from it, committed in the same pull request. The schema SHALL NOT be pushed to a database
directly or changed by hand on production.

#### Scenario: Schema edited without a migration

- **WHEN** the schema definition differs from what the committed migrations produce
- **THEN** generating migrations produces a new migration file, which must be committed

### Requirement: Migrations are forward only

There SHALL be no down migrations. A mistake SHALL be fixed with a new migration. A migration
SHALL keep working with the code that is still running: columns and tables are added first and
removed in a later deploy.

#### Scenario: Fixing a bad migration

- **WHEN** a merged migration turns out wrong
- **THEN** a new migration corrects it, and the applied one is not edited

### Requirement: Pull requests test migrations on their own database

For each pull request, CI SHALL create a separate Neon branch, apply all migrations to it, and run
the tests against it. CI SHALL delete that branch when the job ends, whether the tests passed or
failed.

#### Scenario: Tests pass

- **WHEN** a pull request's tests pass on its Neon branch
- **THEN** the branch is deleted

#### Scenario: Tests fail

- **WHEN** a migration or a test fails on the pull request's Neon branch
- **THEN** the job fails and the branch is still deleted

### Requirement: Production is migrated before deploy

After a merge, the deploy SHALL apply pending migrations to production before the new revision
receives traffic. A failed migration SHALL stop the deploy, leaving the previous revision
serving.

#### Scenario: Migration succeeds

- **WHEN** a merge contains a new migration and it applies on production
- **THEN** the new revision is deployed after it

#### Scenario: Migration fails

- **WHEN** a migration fails on production
- **THEN** no new revision is deployed and the previous one keeps serving

### Requirement: Local runs and tests need no hosted database

Tests SHALL run against an in-process Postgres built from the same migrations, with no network
and no database URL. Analytics SHALL keep writing only the fields it writes today.

#### Scenario: Running tests offline

- **WHEN** `pnpm test` runs with no `DATABASE_URL` and no network
- **THEN** the analytics tests apply the migrations to an in-process database and pass
