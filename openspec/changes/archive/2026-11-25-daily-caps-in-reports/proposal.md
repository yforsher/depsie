# Proposal

## Why

The daily caps are in dollars ($0.25 per signed-in user, $1 shared by all anonymous use), so the
usage page shows users what their reports cost the operator ("Today: $0.0023 of $0.25"), which
reads like a bill on a free tool. A report costs about $0.0023, so a cap counted in reports keeps
the same cost bound in a unit users understand. Part 9 of `docs/plan-platform.md`.

## What Changes

- The daily caps count reports instead of dollars: 10 per UTC day per signed-in user, 400 per UTC
  day shared by all anonymous use (about $1). No dollar limit remains.
- A report is one `ai_usage` row with source `query_expansion` (every report and refresh makes
  that call once, before any other AI call, and the row is written even when the report then
  fails), so refreshes and failed reports count.
- Anonymous reports are also limited to 10 per IP per 24 hours, counted in server memory from
  that IP's first report, next to the hourly limit, so one visitor cannot use up the shared 400.
  Signed-in users are not counted by IP. No IP is stored.
- **BREAKING** (client and server ship together): `GET /api/usage` returns `todayReports` and
  `dailyCap` (a report count) instead of `todayCost` and a dollar cap, and its days carry no cost.
- The usage page shows "Today: N of 10 reports" and a table of day, reports and tokens, with no
  dollar amount.
- The privacy note says tokens and cost are stored to enforce the daily limits and to know what
  the service costs, instead of "to enforce daily cost limits".
- Unchanged: the hourly limits (10 per hour per signed-in user, else per IP), the 503 without the
  database, and the recording of tokens and cost in `ai_usage`, logs and traces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `usage-limits`: the daily caps count reports instead of dollars, with the new values; the
  accounts-flag-off scenario and the usage page requirement change with them; a new per-IP daily
  limit for anonymous reports.
- `report-history`: a refresh counts toward the daily report cap instead of the daily cost cap.

## Impact

- `server/src/limits.ts` (caps and the check), `server/src/app.ts` (the per-IP daily limiter),
  `server/src/usage.ts` (`usageOf()`),
  `shared/src/index.ts` (`UsageDay`, `UsageResponse`).
- `client/src/components/UsagePage.tsx`, `client/src/components/PrivacyNote.tsx`.
- Tests: `server/src/app.test.ts`, `auth.test.ts`, `reports.test.ts`;
  `client/src/components/UsagePage.test.tsx`, `SignInPage.test.tsx`.
- Docs: `server/AGENTS.md`, `client/AGENTS.md`, `docs/product.md`, `README.md`.
- No database migration: the count reads existing `ai_usage` rows.
