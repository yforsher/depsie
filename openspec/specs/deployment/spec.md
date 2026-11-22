# deployment Specification

## Purpose

Makes sure a release reaches users only after the smoke test passed against that release in
production, and that traffic can be sent back to the previous release with one command.

## Requirements

### Requirement: A new revision gets no traffic until its smoke test passes

After a merge, the deploy SHALL create the new revision with no traffic and a fixed tag, run the
smoke test against the tag's URL, and move all traffic to that revision only when the smoke test
passes.

#### Scenario: Smoke test passes

- **WHEN** a merge is deployed and the smoke test passes against the candidate URL
- **THEN** all traffic moves to the new revision

#### Scenario: Smoke test fails

- **WHEN** a merge is deployed and the smoke test fails against the candidate URL
- **THEN** the build fails, the previous revision keeps all traffic, and the build log names the
  failed test

### Requirement: Merges that do not change the app are not deployed

A merge that changes only files outside the app and its smoke test (documentation, plans, specs,
workflow files) SHALL NOT build or deploy a revision. Any other merge SHALL go through the full
deploy with its smoke test.

#### Scenario: Documentation-only merge

- **WHEN** a merge changes only Markdown files and `docs/`
- **THEN** no build starts and the live revision stays as it is

#### Scenario: Merge that touches the app

- **WHEN** a merge changes a Markdown file and a file in `client/`
- **THEN** the full deploy runs, smoke test included

### Requirement: The candidate runs with production settings

The candidate revision SHALL use the same secrets, environment variables, database and scaling
settings as the revision serving users, so the smoke test checks what users will get.

#### Scenario: Candidate reaches real services

- **WHEN** the smoke test runs against the candidate URL
- **THEN** the report it makes uses real npm and OpenRouter data and the production database

### Requirement: The cleanup job runs only promoted code

The report cleanup job SHALL be pointed at a new image only after that image's revision receives
all traffic.

#### Scenario: Smoke test fails

- **WHEN** the smoke test fails
- **THEN** the cleanup job keeps the image of the revision still serving

### Requirement: A failed smoke test leaves migrations applied

Migrations SHALL still run before the candidate is created. A failed smoke test SHALL NOT undo
them, which is safe because a migration keeps working with the code still running.

#### Scenario: Migration followed by a failed smoke test

- **WHEN** a merge with a new migration passes the migration and fails the smoke test
- **THEN** the migration stays applied and the previous revision keeps serving with it

### Requirement: Flag changes are smoke-tested before they get traffic

Turning a feature flag on or off in production SHALL create a revision with no traffic and the
same tag, which gets traffic only after the smoke test passes against its URL.

#### Scenario: Turning a flag on

- **WHEN** a flag variable is changed on the service
- **THEN** users keep the previous revision until the smoke test passes at the tag URL and the
  revision is promoted

### Requirement: Rollback takes one command

Sending all traffic back to the previous revision SHALL take one documented command, with no
rebuild.

#### Scenario: Rolling back

- **WHEN** a promoted revision turns out wrong and the rollback command runs with the previous
  revision's name
- **THEN** all traffic goes to the previous revision

### Requirement: Deploy smoke runs are recorded as anonymous use

The report and visit made by a deploy's smoke test SHALL be recorded like any other anonymous use,
in analytics and `ai_usage`, with no code that detects smoke traffic.

#### Scenario: A deploy runs the smoke test

- **WHEN** the smoke test makes its report against the candidate
- **THEN** one anonymous report and its AI usage are recorded, as for any visitor
