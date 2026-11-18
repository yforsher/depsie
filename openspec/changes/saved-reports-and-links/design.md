# Design

## Context

`POST /api/report` runs the pipeline and returns a `Report` (`shared/src/index.ts`); nothing is
stored. Postgres is reached through Drizzle on the Neon HTTP driver (no interactive transactions),
tests use PGlite built from the migrations, and every user-owned table references `user.id` with
`ON DELETE CASCADE` (Part 4). `ai_usage` rows are written, not awaited, from `chatJson()` with the
user taken from an AsyncLocalStorage (`usageUser`). Flags: `report-links` (anonymous saving and
links) and `accounts` (everything a signed-in user sees) are read once in `createApp()`, and a
flagged route is registered only when its flag is not off.

## Goals / Non-Goals

**Goals:**

- Every saved report is reachable only by its owner, or by its share id, until its deletion date.
- One retention module that every write uses.
- The table layout Part 6 (refresh) and the agents plan (chat) append versions to unchanged.

**Non-Goals:**

- A reports list, version list, refresh or Markdown download (Part 6).
- Editing a report: only `pipeline` versions are written here.

## Decisions

### Tables

`reports`: `id` (uuid, `crypto.randomUUID()`), `user_id` (nullable, FK `user.id` on delete
cascade), `share_id` (nullable, unique), `need`, `framework`, `dependencies` (jsonb), `expires_at`,
`created_at`; index on `expires_at` for the cleanup and on `user_id`.

`report_versions`: `report_id` (FK `reports.id` on delete cascade), `version` (integer, primary key
with `report_id`), `schema_version` (integer), `report` (jsonb), `source` (text with a check on the
four values), `created_at`.

Cascades make every delete (by link, cleanup, account deletion) one statement, so the Neon HTTP
driver needs no transaction. Saving a report is two inserts; a failure between them leaves a
report without versions, which reads as 404 (reads join the latest version) and expires normally.

### `ai_usage.report_id` without a foreign key

The report id is chosen before the pipeline runs and put in the usage AsyncLocalStorage next to
the user, so each AI call's row carries it. The report row is inserted only after the pipeline
succeeds, and usage rows are written before that, so a foreign key would reject them. A plain
nullable uuid column is kept instead: a failed report leaves rows with an id that never existed,
which Part 7 can still trace. It holds no report content, so a deleted report's id staying there
reveals nothing. Alternative rejected: inserting the report row first and deleting it on failure
(an extra write and a cleanup path for every failed report).

### Who may save and share

- Saved for a signed-in user when `accounts` is on for their login; for an anonymous visitor
  when `report-links` is on. Otherwise not saved and `saved` is `null`, as today.
- Anonymous share: `POST /api/reports/:id/share` succeeds for a report with no user when the
  caller knows the id. The id is returned only in the `POST /api/report` response and never
  appears in a page URL or the app's logs, so it works as the creator's secret (122 random
  bits); it is in the path of the share request, so the platform request logs hold it, which only
  people with project access can read, and they can read the database too. Alternative rejected: a
  cookie or token for anonymous ownership (the privacy rules allow no cookie without sign-in).
- Signed-in share and revoke: same endpoints, owner only, `user_id` from the session.
- Delete by link: `DELETE /api/s/:shareId`, only for reports with no user.

### Endpoints

| Route                           | Who                                            | Flag                         |
| ------------------------------- | ---------------------------------------------- | ---------------------------- |
| `POST /api/report`              | as today; returns `{ report, saved }`          | none                         |
| `GET /api/reports/:id`          | owner                                          | `accounts`                   |
| `POST /api/reports/:id/share`   | owner, or anyone with an anonymous report's id | `accounts` or `report-links` |
| `DELETE /api/reports/:id/share` | owner                                          | `accounts`                   |
| `GET /api/s/:shareId`           | anyone                                         | `accounts` or `report-links` |
| `DELETE /api/s/:shareId`        | anyone, anonymous reports only                 | `report-links`               |

`saved` is `{ id, expiresAt, shareId, owned }`; `owned` (a signed-in user's report) tells the
client to offer revoking and the `/reports/:id` page, without an extra `/api/me` call from the
result. Every query filters `expires_at > now()` and, for owner
routes, `user_id` from the session, so a missing, expired, foreign or unshared report gives the
same 404. An anonymous share request under the `accounts`-only route of a signed-in report it
does not own is also 404. Share creation is idempotent: an existing `share_id` is returned.

`GET /api/s/:shareId` returns `{ report, expiresAt, deletable, olderFormat }`; the app shell for
`/s/*` and this endpoint send `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. A header
is used rather than a `<meta>` tag, since the shell is one `index.html` for every route.

### Retention module

`server/src/retention.ts` holds the three periods in days and one function,
`expiresAt(report)`, from `user_id`, `share_id`, `created_at` and the latest version's time. Every
write that changes one of those sets `expires_at` with it. Reads compare against `now()` in SQL.

### Schema versions

`shared` exports `REPORT_SCHEMA_VERSION = 1`. On read, `server/src/reportSchema.ts` maps a stored
version to the current one through a list of converters (empty today). A version with no path is
returned as stored with `olderFormat: true`; the client shows it with a note and no share or
other actions beyond reading. The test saves a version `0` row, which has no converter.

### Cleanup job

`server/src/cleanup.ts` runs one `DELETE FROM reports WHERE expires_at <= now()` and logs the
count; `pnpm cleanup` runs it locally, and the image's compiled `dist/cleanup.js` runs as the Cloud
Run job `depsie-cleanup` (same image, `DATABASE_URL` from Secret Manager), started daily by Cloud
Scheduler. `cloudbuild.yaml` gets a step after Deploy that updates the job to the new image, so the
job always runs the code of the live revision. Alternative rejected: an endpoint called by
Scheduler (the plan forbids a public cleanup endpoint, and a protected one needs auth setup).

### Client

- `fetchReport()` returns `ReportResponse`; `App` passes `saved` to a `ShareControls` component
  under the report: anonymous gets "Create share link", then the link, a copy button and the
  deletion date; signed-in gets the same plus "Revoke link" and a link to `/reports/:id`.
- `/reports/:id`: the owner's report with `ShareControls`; others are redirected as `/account`
  does (404 from the server shows "Report not found").
- `/s/:shareId`: the report read-only, its deletion date and, when `deletable`, a delete button
  with a confirmation; 404 shows "This link does not exist or has expired".
- `PrivacyNote`: the storage line reads both flags while open, as the account line does today.

### events columns

A migration drops `prompt_tokens`, `completion_tokens` and `cost` from `events`. The Part 4 code
writes no values to them, but Drizzle names every schema column in an insert (filled with
`default`), so its `events` inserts fail once the columns are gone. Between the Migrate step and
the new revision taking traffic (1 to 2 minutes) the live revision's analytics writes are lost;
they are not awaited, so responses are unaffected. A two-step drop is not possible: no revision can
stop naming the columns while the schema has them, and CI fails when schema and migrations
disagree. Accepted by the user on 2026-11-17.

## Risks / Trade-offs

- [Anyone with an anonymous report's id can share it] → the id is never in a page URL or the app's
  logs and is only in the response to the creator; logging rules already forbid report data.
  Cloud Run's request logs hold API paths (report and share ids), readable only with project
  access.
- [A share link is a bearer secret] → `noindex` and `no-referrer` keep it out of search engines
  and outgoing Referer headers; anonymous reports can be deleted from the link, signed-in ones
  revoked.
- [Saving fails after the AI calls were paid] → the save is awaited and a failure returns 500; the
  cost cap check just before already proved the database reachable, so this is rare.
- [Cleanup job not yet updated when the schema changes] → the job runs the image of the last
  deploy, updated by Cloud Build after migrations, so it never runs against an older schema
  than its code expects for more than one deploy step.

## Migration Plan

1. One migration adds `reports`, `report_versions` and `ai_usage.report_id`; a second drops the
   `events` columns. Both run in the existing Migrate step before Deploy.
2. Deploy with both flags off: nothing is saved, `POST /api/report` returns `saved: null`, and the
   smoke test passes.
3. With the user's approval, create the Cloud Run job and Scheduler trigger, then turn
   `report-links` on and test links end to end on the live URL, and `accounts` for the user's
   login for signed-in links.
4. Rollback: turn the flags off; the tables stay and the cleanup empties them within 30 days. Do
   not roll back to a Part 4 image: its `events` inserts name the dropped columns, so it would
   record no analytics.
