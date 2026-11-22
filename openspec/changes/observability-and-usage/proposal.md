# Proposal

## Why

Today only `POST /api/report` and refresh log with a request id, the lines are plain text, and
there is no way to see where a slow or expensive report spent its time. Signed-in users cannot see
what they used against their daily cost cap. This is Part 8 of `docs/plan-platform.md`: for any
report id, the operator sees every stage with its time and cost, and a user sees their own usage.

## What Changes

- Every request (every API path and the app shell) gets a request id; every server log line is one
  JSON object that Cloud Logging reads (`severity`, `message`, the request id and the trace id),
  so the lines of one request are found together and next to its trace. Lines still never hold the
  need text, dependency names or a user id.
- OpenTelemetry traces exported to Cloud Trace: one span per request, per pipeline stage (query
  expansion, candidate search, data fetch, comparison), per external call and per AI call. AI call
  spans carry the step, model, tokens and cost; the request span carries the report id once the
  report is saved, so a trace can be found by report id.
- Export on Cloud Run only. Spans are exported in the background after the response; this is safe
  because the service uses instance-based billing (CPU stays allocated), which is checked on the
  live service and recorded with the evidence. Pending spans are flushed on shutdown.
- Usage page for signed-in users (`/usage`, linked from the account menu, under the `accounts`
  flag, which is on): reports, tokens and cost per day for the last 30 days, from `ai_usage` only,
  and today's spend against the $0.25 daily cap. New endpoint `GET /api/usage`.
- Privacy wording (user's decision, 2026-11-22): traces and logs now hold a report id, exact times,
  tokens and cost, which an operator could match by time to an `events` row. This is accepted and
  documented: these are operator-only Google Cloud stores kept 30 days; in the database `events`
  stays unlinked and tokens and cost stay only in `ai_usage`. `AGENTS.md`, `docs/product.md` and
  the privacy note say so.

## Capabilities

### New Capabilities

- `observability`: request ids, structured logs and traces: what each holds, what it never holds,
  and that a report's trace can be found by its id.

### Modified Capabilities

- `usage-limits`: "AI usage cannot be linked to analytics" is narrowed to the database, with logs
  and traces as documented operator-only exceptions; a new requirement adds the usage page and
  `GET /api/usage`.

## Impact

- Server: `src/log.ts` (JSON lines, request id middleware on every path), new `src/tracing.ts`
  (SDK setup, span helpers), `src/index.ts` (start and shutdown), spans in `candidates.ts`,
  `report.ts`, `openrouter.ts`, `packageData.ts`; `app.ts` (middleware order, report id on the
  span, `GET /api/usage`); `src/usage.ts` (usage query). The two `console.*` calls outside
  `log()` move to it.
- Client: `api.ts` (`fetchUsage()`), new `UsagePage.tsx`, route `/usage`, menu link.
- Shared: `UsageDay` and `UsageResponse` types.
- New dependencies: `@opentelemetry/api`, `@opentelemetry/sdk-trace`,
  `@opentelemetry/context-async-hooks`, `@opentelemetry/resources`,
  `@opentelemetry/exporter-trace-otlp-proto`, `google-auth-library` (confirmed in the first
  task).
- Google Cloud: Cloud Telemetry API enabled (it already is) and the trace writer role for the Cloud Run service
  account; recorded in `docs/hosting.md`.
- No schema migration: `ai_usage` already has the columns the usage page needs.
- Docs: `AGENTS.md`, `server/AGENTS.md`, `client/AGENTS.md`, `docs/hosting.md`,
  `docs/product.md`, `docs/plan-platform.md`.
