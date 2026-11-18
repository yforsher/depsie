# Proposal

## Why

A report disappears when the page closes, so it cannot be shown to a teammate or reviewer (use
case 2 in `docs/product.md`). Accounts exist since Part 4; this part saves every report with a
retention period, gives signed-in users private reports, and lets anyone share a report with an
unguessable read-only link. Part 6 (history, refresh) and the chat and MCP of the agents plan all
build on saved reports.

## What Changes

- Tables `reports` and `report_versions`; every change to a report appends a version (`source`
  `pipeline` here; `refresh`, `chat` and `agent` come in later parts). `ai_usage` gets a
  `report_id` column. The unused `events` token and cost columns are dropped.
- Each version stores the shared report schema version it was saved with; older versions are
  converted on read, or shown read-only with a note when they cannot be.
- Retention periods as constants in one module: anonymous 10 days, anonymous with a link 30 days
  (both from creation), signed-in 100 days from the latest version. Expired reports return 404,
  and a daily Cloud Run job (`pnpm cleanup`, started by Cloud Scheduler) deletes them.
- Signed-in reports are saved to the user, private, at `/reports/:id` for the owner only; the
  owner creates and revokes a share link.
- Anonymous reports are saved with no user (while `report-links` is on); a button creates a share
  link, which extends retention to 30 days; the link page can delete the report.
- Share pages at `/s/:share_id`: read-only, no sign-in, latest version, `noindex`,
  `Referrer-Policy: no-referrer`.
- **BREAKING** (internal API): `POST /api/report` returns `{ report, saved }` instead of the bare
  report; the client is updated in the same change.
- The privacy note says what is stored, for how long, who can open it, how to delete it or revoke
  a link, and that the session cookie exists only after signing in.

## Capabilities

### New Capabilities

- `saved-reports`: storing reports and their versions, schema versions, retention and cleanup, and
  who can open a saved report.
- `report-sharing`: share links for anonymous and signed-in reports, the read-only share page,
  revoking and deleting by link.

### Modified Capabilities

- `usage-limits`: each `ai_usage` row records the report it was spent on, and the `events` token
  and cost columns no longer exist.

## Impact

- Server: `db/schema.ts` and new migrations; new `src/reports.ts` (store, read, share, revoke,
  delete), `src/retention.ts`, `src/cleanup.ts`; routes under `/api/reports` and `/api/s`;
  `app.ts` (`POST /api/report` saves the report), `usage.ts` (report id).
- Shared: `ReportResponse`, `SavedReport`, `SharedReport`, `REPORT_SCHEMA_VERSION`.
- Client: routes `/reports/:id` and `/s/:shareId`, share controls on the result, `api.ts`,
  `PrivacyNote.tsx`.
- Infrastructure: a Cloud Run job `depsie-cleanup` from the service image, a Cloud Scheduler
  trigger, and a `cloudbuild.yaml` step that updates the job image on deploy.
- Docs: `server/AGENTS.md`, `client/AGENTS.md`, `docs/hosting.md`, `docs/plan-platform.md`.
