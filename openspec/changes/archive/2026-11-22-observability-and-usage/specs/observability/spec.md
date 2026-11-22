## Purpose

Lets the operator follow any request through its log lines and trace, and see for any report
where its time and cost went, without logs or traces holding what the user typed or who they are.

## ADDED Requirements

### Requirement: Every request has a request id in every log line

The server SHALL give every request (every API path and the app shell) a request id. Every log
line written while handling a request, including the line when its response is sent, SHALL carry
that id.

#### Scenario: A report request

- **WHEN** `POST /api/report` runs the whole pipeline
- **THEN** every log line written for it carries the same request id

#### Scenario: Another path

- **WHEN** `GET /api/reports` or the app shell is requested
- **THEN** its response line carries a request id, different from any other request's

### Requirement: Log lines are structured

Every server log line SHALL be one JSON object with a severity, a message and, during a request,
its request id and trace id in the fields Cloud Logging uses to group a request's lines with its
trace. Lines outside a request (startup, the cleanup job) SHALL use the same format without them.

#### Scenario: Reading the logs

- **WHEN** a report request finishes on Cloud Run
- **THEN** Cloud Logging shows its lines with their severity, grouped under the request's trace

### Requirement: Logs and traces hold no user content or user id

Log lines and trace spans SHALL NOT contain the need text, dependency names, the report, a user
id, an IP address or a session.

#### Scenario: A signed-in user's report

- **WHEN** a signed-in user makes a report with a package.json
- **THEN** no log line or span holds the need, a dependency name or the user's id

### Requirement: A report's trace shows every stage with its time and cost

Every request SHALL produce one trace. A report request (new or refresh) SHALL have one span per
pipeline stage (query expansion, candidate search, package data fetch, comparison), one per
external call and one per AI call. Each AI call span SHALL carry the step, model, prompt and
completion tokens and cost. When the report is saved, the trace SHALL carry its report id, so the
trace can be found from a report id.

#### Scenario: Finding a report's trace

- **WHEN** the operator searches Cloud Trace for a saved report's id
- **THEN** the trace shows every stage and external call with its duration, and each AI call with
  its tokens and cost

#### Scenario: A failed report

- **WHEN** an AI call's answer is rejected
- **THEN** the trace still holds that AI call's span with its tokens and cost, marked as an error

### Requirement: Spans are not lost after the response

Spans SHALL be exported to Cloud Trace when the server runs on Cloud Run, including spans that end
after the response is sent, and pending spans SHALL be flushed when the server shuts down. Outside
Cloud Run (local runs, tests, CI, the e2e server) nothing SHALL be exported.

#### Scenario: Spans after the response

- **WHEN** a report request finishes on Cloud Run
- **THEN** its full trace, including the request span, appears in Cloud Trace

#### Scenario: Local run

- **WHEN** the server runs locally or in tests
- **THEN** no span is sent to any outside service
