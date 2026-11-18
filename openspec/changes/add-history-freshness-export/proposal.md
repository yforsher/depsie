# Proposal

## Why

Use case 3 in `docs/product.md` is "come back to a past decision and check it is still valid".
Part 5 saves reports, but a signed-in user cannot list them, see their versions, delete one or
refresh it, and no report says how old its data is. The Markdown download promised since the MVP
(old Part 15) is still missing. This is Part 6 of `docs/plan-platform.md`, the last part before
the `accounts` flag can be turned on.

## What Changes

- Reports page at `/reports` for the signed-in owner: their unexpired reports, newest first, each
  with its need, framework, latest version date, version count and share link state, and a delete
  button. A report opens in the existing `ReportView` at `/reports/:id`, which gains a version
  list and its own delete button that returns to `/reports` after deleting; any version can be
  opened, the share link always shows the latest.
- Freshness on every report view (the result, `/reports/:id`, `/s/:shareId`): when the data was
  fetched and how many days ago, measured when the report is viewed. From 7 days (one constant in
  `shared/`) a warning says releases and vulnerabilities may have changed since then.
- Refresh, for the signed-in owner only: runs the pipeline again with the saved need, framework
  and dependencies and appends a version with source `refresh`, which restarts the 100-day
  retention. It counts toward the hourly limit and the daily cost cap. On a shared report the
  warning suggests signing in or running a new report instead.
- Owner delete: removes a signed-in report and its versions.
- Markdown download on every report view, built in code from the structured report (no AI call),
  including the fetch date of each data source.
- New endpoints behind `accounts`: `GET /api/reports`, `GET /api/reports/:id?version=N`,
  `DELETE /api/reports/:id`, `POST /api/reports/:id/refresh`. `GET /api/reports/:id` also returns
  the version list.
- Flags: the reports page, versions, refresh and delete stay behind `accounts`. Freshness and the
  Markdown download are shown to everyone without a flag: they work on any report, including the
  anonymous result, and give value on their own.

## Capabilities

### New Capabilities

- `report-history`: the signed-in owner's list of reports, their versions, refresh and delete.
- `report-freshness`: how old a report's data is, and the warning after a fixed number of days.
- `report-export`: the Markdown download built from the structured report.

### Modified Capabilities

None. Refresh uses the existing version, retention and limit requirements in `saved-reports` and
`usage-limits` as they are written.

## Impact

- `shared/`: freshness constant and function, report list and version types, `OwnedReport` gains
  `version` and `versions`.
- `server/`: `reports.ts` (list, read a version, delete, append a version), `app.ts` (four routes,
  refresh shares the report rate limiter and cost cap), docs in `server/AGENTS.md`.
- `client/`: `/reports` route and page, version list, refresh and delete on `SavedReportPage`,
  freshness line and warning, Markdown builder and download button, account menu link, docs in
  `client/AGENTS.md`.
- No schema migration: `reports` and `report_versions` already hold everything needed.
- No new dependencies.
