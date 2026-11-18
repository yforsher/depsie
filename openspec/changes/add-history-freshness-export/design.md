# Design

## Context

Part 5 stores `reports` (inputs, owner, share id, `expires_at`) and `report_versions` (one row per
version, with `source` already allowing `refresh`). `server/src/reports.ts` reads the latest
version through one query, `findReport()`, that filters `expires_at > now()`; `retention.ts` sets
`expires_at`; `app.ts` registers the signed-in routes inside `if (auth)` with `requireAccounts`.
`POST /api/report` runs `generateReport()` behind `reportLimiter` (keyed by user id when signed in)
and `checkCostCap`. The client shows a report with `ReportView` on `/`, `/reports/$id` and
`/s/$shareId`. Requirements are in the three specs of this change.

## Goals / Non-Goals

**Goals:**

- Reuse the existing pipeline, limiter, cost cap, retention and report queries; no new tables.

**Non-Goals:**

- Pagination or search on the reports page (at most 10 reports an hour, kept 100 days).
- Diffs between versions.
- Recording refreshes in the anonymous `events` table: it counts form requests; per-user numbers
  come from the account tables (`report_versions`, `ai_usage`).

## Decisions

### API

| Route                            | Who                   | Answer                                                    |
| -------------------------------- | --------------------- | --------------------------------------------------------- |
| `GET /api/reports`               | signed in, `accounts` | `ReportSummary[]`, newest version first; 401 anonymous    |
| `GET /api/reports/:id?version=N` | owner, `accounts`     | `OwnedReport` of version N (latest when absent); 404      |
| `DELETE /api/reports/:id`        | owner, `accounts`     | 204; 404 otherwise                                        |
| `POST /api/reports/:id/refresh`  | owner, `accounts`     | `OwnedReport` of the new version; 401, 404, 429, 502, 503 |

All are registered inside `if (auth)` with `requireAccounts`, like `GET /api/reports/:id`, so they
do not exist while `accounts` is off. `version` is validated as a positive integer; anything else
is 404, like a non-uuid id.

`OwnedReport` gains `version` (the one shown) and `versions: { version, source, createdAt }[]`, so
the report page needs one request. `ReportSummary` is `{ id, need, framework, updatedAt,
versionCount, shared }`: `updatedAt` is the latest version's time, the list order.

### Refresh order of checks

`POST /api/reports/:id/refresh` runs: `requestLogging`, `withUser`, `requireAccounts`, 401 without
a user, owner lookup (404), `usageUser`, the same `reportLimiter` instance as `POST /api/report`,
`checkCostCap`, then `generateReport()` with the saved `{ need, framework, dependencies }` and
`appendVersion()`. Sharing the limiter instance makes a refresh count toward the same hourly
counter. Checking the session and ownership first means a stranger never spends anyone's limit
and no AI call happens for them. `setUsageReport(id)` tags the `ai_usage` rows with the report.

Alternative considered: a body flag on `POST /api/report` to refresh. Rejected: it mixes the
anonymous form endpoint with an owner-only action and its 401/404 rules.

### Appending a version

`appendVersion()` inserts `version = (select max(version) + 1 ...)` in one statement with source
`refresh` and the current `REPORT_SCHEMA_VERSION`, then sets `expires_at` with `expiresAt()` from
the new version's time. Two refreshes at once collide on the `(report_id, version)` primary key
and the second fails with 500; the button is disabled while a refresh runs, so only a second tab
can cause it. A refresh of a report shown with `olderFormat` works too and is the way to bring it
to the current schema.

### Reading versions

`findReport()` keeps its single query; `findOwnedReport(id, userId, version?)` adds
`version = N` to the condition when given. The version list is a second small query on
`report_versions` ordered by version. The share link keeps reading the latest version, unchanged.

### Freshness

`shared/` gets `STALE_AFTER_DAYS = 7` and `dataAge(fetchedAt, now)` returning `{ days, stale }`,
where `days` is whole elapsed days (`floor`) and `stale` is `days >= STALE_AFTER_DAYS`. The fetch
date is `report.generatedAt`: every source is fetched within the same request, at most 90 seconds
earlier, and it exists on every report, while `sources` can be empty when no package was found.
The server uses no freshness logic yet; the constant lives in `shared/` because the plan asks for
one shared constant and the agents plan will need it.

`ReportView` takes an optional `staleAction` node and renders a `Freshness` line under its header
("Data fetched Nov 18, 2026, 3 days ago"), with the warning and the action when stale. Callers
pass the action: the owner's latest version a Refresh button; an earlier version a link to the
latest; a shared page links to sign in (not for a viewer already signed in) and to a new report.
The form result passes none: it is always fresh. Refresh has no age condition, so while the
latest version's data is not old yet, its Refresh button sits in the report history panel
instead: one button either way (found in code review: the first version only offered it from the
warning). Time is `Date.now()` at render; tests pass a fixed `now` to `dataAge()`.

### Markdown

`client/src/markdown.ts` exports `reportToMarkdown(report)`: a pure function mirroring
`ReportView`'s sections and labels (claims end with their sources, as on screen; dates through the
same `formatDate`). A `DownloadMarkdown` button in `ReportView`'s header makes a `Blob` and clicks
a temporary `<a download="depsie-<generated date>.md">`. Putting it in `ReportView` gives every
view, and the version shown, the download with no per-page code. No library: the report is a
small fixed structure. Tested with a file snapshot of `mockReport` plus explicit checks for each
section heading and the fetch dates.

### Client pages

- `/reports`: `ReportsPage`, redirecting like `/account`. Each row links to `/reports/$id` and has
  Delete (confirmed inline, as on the shared page, through a small `DeleteButton` shared with the
  report page); delete invalidates the list query.
- `/reports/$id` takes an optional `version` search param. `SavedReportPage` shows the version
  list (links), `ShareControls` and Refresh only on the latest version, and an "earlier version"
  note otherwise. After a refresh it replaces the query data with the answer and drops `version`.
  Delete is on every version, since it removes the whole report: confirmed inline with the same
  `DeleteButton` as the list (one component for both), then it removes the report's query,
  invalidates the list and navigates to `/reports` with `replace`, so Back does not reopen a
  report that no longer exists.
- `AccountMenu` gets a Reports item above Account.

### Flags

Reports page, versions, refresh and delete are behind `accounts` (routes and UI). Freshness and
the Markdown download have no flag: they change only how any report is shown and give value
alone; the smoke test keeps passing since it does not check the absence of either.

## Risks / Trade-offs

- [A refresh's AI cost is spent even when the request then fails validation] → The same as
  `POST /api/report` today; usage is recorded per call and capped daily.
- [Concurrent refreshes in two tabs give one 500] → Rare and harmless (no partial version); the
  button is disabled while pending.
- [Markdown drifts from `ReportView` when the report shape changes] → The snapshot test fails on
  any change to `mockReport`'s output, and `REPORT_SCHEMA_VERSION` bumps already flag shape changes.
- [A user's clock is wrong] → The age is approximate by nature; dates themselves are shown in UTC.

## Migration Plan

No database migration. Deploy with `accounts` off as today: production shows freshness and the
download on anonymous reports, nothing else changes. Then set `FEATURE_ACCOUNTS` to the user's
login to check the success criteria on the live URL; turning `accounts` on for everyone is the
user's decision, recorded in `docs/plan-platform.md`. Rollback is redeploying the previous
revision; no data changes shape.
