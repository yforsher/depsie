# Design

## Context

- `src/log.ts` prefixes lines with an 8-character id held in an `AsyncLocalStorage`, set only by
  `requestLogging` on `POST /api/report` and refresh. Other paths log without an id, and
  `app.ts`, `index.ts` and `cleanup.ts` still call `console.*` directly.
- Every outside call goes through one of three `fetch` sites: `get()` in `sources.ts`, the npm
  calls in `candidates.ts`, and `chatJson()` in `openrouter.ts`, which already measures each AI
  call and has its tokens and cost from OpenRouter's `usage`.
- The report id is created in `app.ts` before the pipeline (`setUsageReport()`), so it is known
  before any AI call.
- Cloud Run billing is instance-based (`docs/hosting.md`, Settings), so CPU stays allocated after
  a response. Export in the background is then safe; this is checked on the live service, not
  assumed.
- Current Google docs (opentelemetry-operations-js `MIGRATION.md`): the Cloud Trace exporter
  package is legacy; the recommended path is the OTLP exporter sending to
  `telemetry.googleapis.com`, with `google-auth-library` for the token and the GCP resource
  detector.
- `ai_usage` has `user_id`, `source`, tokens, `cost` and `day`, indexed on `(user_id, day)`: the
  usage page needs no migration.
- Privacy decision (user, 2026-11-22): traces and logs may hold the report id, exact times, tokens
  and cost; documented, see proposal.

## Goals / Non-Goals

**Goals:**

- One id per request across log lines and trace, on every path.
- A report's trace, found by report id, shows each stage, outside call and AI call with time and,
  for AI calls, tokens and cost.
- Usage page from `ai_usage` only.

**Non-Goals:**

- Metrics, dashboards or alerts in Cloud Monitoring.
- Database query spans (Neon), and spans for Better Auth's own requests beyond the request span.
- Browser tracing; the client is unchanged apart from the usage page.
- Joining Cloud Run's own request trace (see Decisions).

## Decisions

**The request id is the trace id.** A middleware registered first in `createApp()` starts the
request span for every request and ends it on `close`; `log()` reads the trace id from the active
span. One id instead of two, and Cloud Logging groups lines by it through
`logging.googleapis.com/trace` (`projects/<project>/traces/<trace id>`) and
`logging.googleapis.com/spanId`. Alternative: keep the short random id and add the trace id as a
second field; rejected as two ids for one thing. The tracer provider is registered everywhere
(local, tests, e2e) so ids always exist; only the exporter is Cloud Run only. The existing
`requestLogging` and its `AsyncLocalStorage` are replaced by this middleware.

**A new root span per request, always sampled.** The middleware does not continue Cloud Run's
incoming `traceparent`: Cloud Run samples its own traces, and a parent-based sampler would drop
most of ours. Every request is traced; at this traffic (about 130 visits and 30 reports in 28
days) the span volume is far below Cloud Trace's free allowance.

**Log lines are JSON on stdout.** `{ severity, message, "logging.googleapis.com/trace",
"logging.googleapis.com/spanId", "logging.googleapis.com/trace_sampled": true }`. Cloud Run sends
stdout to Cloud Logging, which parses it; no logging library. The project id for the trace field
comes from `GOOGLE_CLOUD_PROJECT`, set by the deploy step; without it (local) the line has only
`traceId`. `severity` is `INFO` or `ERROR`. The rejected model output stays a separate `ERROR`
line, never stored elsewhere.

**Manual spans, through one helper.** `tracing.ts` exports `withSpan(name, attributes, fn)`,
which runs `fn` in an active span, records an exception and error status on throw, and ends it.
Stages: `query_expansion`, `candidate_search`, `package_data`, `comparison` (in `candidates.ts`
and `report.ts`). Outside calls: `get()` in `sources.ts` and the npm calls in `candidates.ts` get
a span named for the host with `http.response.status_code`; AI calls get a span in `chatJson()`
with `ai.step`, `ai.model`, `ai.provider`, `ai.prompt_tokens`, `ai.completion_tokens` and
`ai.cost`, set as soon as usage is known, before validation, so a rejected answer still shows
its cost. Alternative: `@opentelemetry/instrumentation-undici` (automatic `fetch` spans); rejected
because it records the full URL, and the npm search query string holds keywords derived from the
need, and because tests stub `fetch`, so its spans could not be tested. Span attributes hold
URLs without their query string; candidate package names may appear (public packages, as in
today's log lines), never the user's dependency names or need.

**The report id on the request span.** `app.ts` sets `report.id` on the request span next to
`setUsageReport()`, and logs one `report saved` line with it, so a report id leads to its trace
both from Cloud Trace (attribute search) and from Cloud Logging. No user id on spans or lines.

**Export.** When `K_SERVICE` is set (Cloud Run), a `BatchSpanProcessor` with
`OTLPTraceExporter` sends to `https://telemetry.googleapis.com/v1/traces`, with a fresh token per
batch from `google-auth-library`, and a resource with `gcp.project_id` (required by the endpoint)
from `GOOGLE_CLOUD_PROJECT` and `service.name` from `K_SERVICE`. No GCP resource detector: it sets
only `cloud.account.id`, not `gcp.project_id` (checked in the first task). Otherwise no exporter.
`index.ts` flushes and shuts the provider down on `SIGTERM`. Tracing starts in `index.ts` before
`createApp()`, and in tests through an in-memory exporter helper. Packages (first task):
`@opentelemetry/api`, `@opentelemetry/sdk-trace` (which replaces the deprecated
`sdk-trace-base` and `sdk-trace-node`), `@opentelemetry/context-async-hooks`,
`@opentelemetry/resources`, `@opentelemetry/exporter-trace-otlp-proto`, `google-auth-library`.

**CPU after the response.** Background export is kept, not a flush per request, because billing is
instance-based. The first task proves it: `gcloud run services describe` shows
`run.googleapis.com/cpu-throttling: 'false'`, and after the deploy a report's full trace,
request span included, is in Cloud Trace. If CPU turns out throttled, the fix is
`--no-cpu-throttling`, not a flush in the request path.

**Usage endpoint and page.** `GET /api/usage` (behind `accounts`, `requireAccounts`, 401 without
a session) runs one grouped query on `ai_usage` for the session's user over the last 30 UTC days:
per day the reports run (rows with source `query_expansion`: every report and refresh makes that
call first, and only once), tokens (prompt plus completion) and cost; plus today's cost and
`USER_DAILY_COST`. Types `UsageDay` and `UsageResponse` in `shared/`. Alternative for counting
reports: distinct `report_id`; rejected because two refreshes of one report on one day are two
runs that each cost money. The client page `/usage` is a table (day, reports, tokens, cost),
newest first, with "Today: $x of $0.25" above it; it redirects like `/account`, and the account
menu gets a Usage item. No new flag: `accounts` already hides the usage page (plan's flag table)
and is on.

## Risks / Trade-offs

- [Trace export fails, for example a missing IAM role] → Export errors are logged by the SDK and
  never fail a request; the first deploy is checked in Cloud Trace before the part is done.
- [OTLP endpoint or auth differs from the docs read today] → First task confirms the packages,
  the endpoint, the role (`roles/telemetry.tracesWriter`) and the API to enable, and records them
  in `docs/hosting.md`.
- [Report id and exact time in traces let the operator match a signed-in user's report to its
  `events` row] → Accepted by the user; operator-only, 30-day retention, written in the privacy
  texts.
- [Smoke reports appear in traces] → Expected; they are recorded like any anonymous use (Part 7).
- [New dependencies add startup time] → Measured as the cold start before and after, recorded in
  the plan.

## Migration Plan

No schema migration. Before merging: enable the Cloud Telemetry API and give the Cloud Run service
account the trace writer role (commands in `docs/hosting.md`). The deploy sets
`GOOGLE_CLOUD_PROJECT`. Rollback is the existing one-command traffic rollback; the role and API can
stay.
