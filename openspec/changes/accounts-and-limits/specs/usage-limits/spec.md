# Spec Delta

## Purpose

Keeps AI costs predictable: every AI call is recorded, and limits enforced in code stop a user,
an IP or all anonymous use before they spend more than a fixed amount.

## ADDED Requirements

### Requirement: Every AI call is recorded

Every AI call SHALL write one `ai_usage` row with the user (empty when anonymous), the source (the
step, for example `query_expansion` or `comparison`), the model, the prompt and completion tokens,
the cost and the time. A row SHALL be written even when the call's answer is rejected afterwards.

#### Scenario: Anonymous report

- **WHEN** an anonymous report finishes
- **THEN** two `ai_usage` rows exist for it, with no user, one per AI call

#### Scenario: Signed-in report

- **WHEN** a signed-in user's report finishes
- **THEN** two `ai_usage` rows exist for it with that user

### Requirement: Reports are limited per hour

A signed-in user SHALL get at most 10 reports per hour, counted per user. Anonymous use SHALL get
at most 10 reports per hour, counted per IP. The next request SHALL get 429 with a message naming
the limit.

#### Scenario: Eleventh report in an hour

- **WHEN** a user, or an IP when anonymous, asks for an 11th report within an hour
- **THEN** the response is 429 and no AI call is made

#### Scenario: Signed-in users on one IP

- **WHEN** two signed-in users behind the same IP each ask for 10 reports in an hour
- **THEN** all 20 are allowed

### Requirement: AI usage cannot be linked to analytics

AI tokens and cost SHALL be recorded only in `ai_usage`, with the UTC day of each call and not its
time. The anonymous `events` rows SHALL NOT record tokens or cost, so a signed-in user's AI usage
cannot be matched to them by time or by numbers.

#### Scenario: A report

- **WHEN** a report finishes
- **THEN** its `events` row has no tokens or cost, and its `ai_usage` rows have the day but no time

### Requirement: Daily AI cost caps

Before a report starts, the server SHALL sum today's (UTC) `ai_usage` cost. A signed-in user whose
sum has reached $0.25, or any anonymous request once the anonymous sum has reached $1, SHALL get 429
with a message saying the daily limit was reached, and no AI call SHALL be made. The limits SHALL
be constants in one place.

#### Scenario: User cap reached

- **WHEN** a signed-in user has spent $0.25 today and asks for a report
- **THEN** the response is 429 and no AI call is made

#### Scenario: Anonymous cap reached

- **WHEN** anonymous use has spent $1 today and an anonymous visitor asks for a report
- **THEN** the response is 429, while a signed-in user under their own cap still gets reports

#### Scenario: New day

- **WHEN** the UTC day changes
- **THEN** the caps count from zero again

### Requirement: No report without the usage check

When the database cannot be reached, the server SHALL refuse report requests with 503 and a message
that reports are unavailable, and SHALL make no AI call.

#### Scenario: Database down

- **WHEN** the database cannot be reached and a report is requested
- **THEN** the response is 503 and no AI call is made

### Requirement: The limits apply with the accounts flag off

The per-IP hourly limit and the anonymous daily cap SHALL apply whatever the `accounts` flag is.

#### Scenario: Flag off in production

- **WHEN** `accounts` is off and anonymous use has spent $1 today
- **THEN** the next report request gets 429
