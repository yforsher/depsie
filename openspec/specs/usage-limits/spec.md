# usage-limits Specification

## Purpose

Keeps AI costs predictable: every AI call is recorded, and limits enforced in code stop a user,
an IP or all anonymous use before they spend more than a fixed amount.

## Requirements

### Requirement: Every AI call is recorded

Every AI call SHALL write one `ai_usage` row with the user (empty when anonymous), the source (the
step, for example `query_expansion` or `comparison`), the model, the prompt and completion tokens,
the cost and the UTC day. When the report is saved, the row SHALL also carry the saved report's id;
otherwise the report id is empty. A row SHALL be written even when the call's answer is rejected
afterwards.

#### Scenario: Anonymous report

- **WHEN** an anonymous report finishes
- **THEN** two `ai_usage` rows exist for it, with no user, one per AI call

#### Scenario: Signed-in report

- **WHEN** a signed-in user's report finishes
- **THEN** two `ai_usage` rows exist for it with that user

#### Scenario: Saved report

- **WHEN** a report is saved
- **THEN** both of its `ai_usage` rows carry the saved report's id

#### Scenario: Report not saved

- **WHEN** a report is not saved because neither `report-links` nor `accounts` applies
- **THEN** its `ai_usage` rows have no report id

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

In the database, AI tokens and cost SHALL be recorded only in `ai_usage`, with the UTC day of each
call and not its time. The anonymous `events` table SHALL have no token or cost columns, so a
signed-in user's AI usage cannot be matched to its rows by time or by numbers. The operator-only
logs and traces, kept 30 days by Google Cloud, MAY hold a report id, exact times, tokens and cost;
the privacy texts SHALL say so.

#### Scenario: A report

- **WHEN** a report finishes
- **THEN** its `events` row has no tokens or cost, and its `ai_usage` rows have the day but no time

#### Scenario: Events columns

- **WHEN** the migrations of this change are applied
- **THEN** `events` has no `prompt_tokens`, `completion_tokens` or `cost` column, and its existing rows are kept

#### Scenario: Privacy note

- **WHEN** a visitor opens the privacy note
- **THEN** it says that operator logs and traces keep report ids, times, tokens and cost for 30 days

### Requirement: Daily report caps

Before a report starts, the server SHALL count today's (UTC) reports, where one report is one
`query_expansion` AI call recorded in `ai_usage`, whether the report then succeeded or failed. A
signed-in user who has run 10 reports today, or any anonymous request once anonymous use has run
400 reports today, SHALL get 429 with a message saying the daily limit was reached, and no AI call
SHALL be made. No limit SHALL be counted in dollars. The limits SHALL be constants in one place.

#### Scenario: User cap reached

- **WHEN** a signed-in user has run 10 reports today and asks for an 11th
- **THEN** the response is 429 and no AI call is made, while another signed-in user still gets
  reports

#### Scenario: Failed reports count

- **WHEN** a signed-in user's 10 reports today all failed after the query expansion call and they
  ask for another
- **THEN** the response is 429 and no AI call is made

#### Scenario: Cost does not limit

- **WHEN** a signed-in user has run 1 report today whose AI calls cost more than $1
- **THEN** their next report is allowed

#### Scenario: Anonymous cap reached

- **WHEN** anonymous use has run 400 reports today and an anonymous visitor asks for a report
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

- **WHEN** `accounts` is off and anonymous use has run 400 reports today
- **THEN** the next report request gets 429

### Requirement: Signed-in users see their usage

`GET /api/usage` SHALL return, for the session's user only and from `ai_usage` only, the reports
run and tokens of each UTC day with usage in the last 30 days, the reports run today and the daily
cap in reports, and no cost. It SHALL answer 401 without a session and 404 while `accounts` is not
on for the caller. `/usage` SHALL show it, with no dollar amount, linked from the account menu,
and redirect like `/account`.

#### Scenario: Usage over several days

- **WHEN** a signed-in user made 2 reports yesterday and 1 today
- **THEN** the usage page lists both days with their reports and tokens, and "Today: 1 of 10
  reports"

#### Scenario: Another user's usage

- **WHEN** another user and anonymous visitors also made reports
- **THEN** none of their usage is counted

#### Scenario: No usage

- **WHEN** a signed-in user has made no report in 30 days
- **THEN** the page says there is no usage yet and shows "Today: 0 of 10 reports"

#### Scenario: Not signed in

- **WHEN** a request without a session calls `GET /api/usage`
- **THEN** the response is 401

### Requirement: Anonymous reports are limited per IP per day

Anonymous use SHALL get at most 10 reports per IP in 24 hours, counted from that IP's first
report. The next request SHALL get 429 with a message naming the limit, and no AI call SHALL be
made. Signed-in users SHALL not be counted by IP, and the IP SHALL not be stored.

#### Scenario: Eleventh anonymous report in a day

- **WHEN** an IP has made 10 anonymous reports over several hours and asks for an 11th within 24
  hours of its first
- **THEN** the response is 429 with a message naming the daily limit, and no AI call is made

#### Scenario: Signed-in user behind that IP

- **WHEN** an IP has reached its anonymous daily limit and a signed-in user behind it asks for a
  report
- **THEN** the report is allowed

#### Scenario: Another IP

- **WHEN** one IP has reached its anonymous daily limit and another IP asks for an anonymous report
- **THEN** the report is allowed

#### Scenario: Accounts flag off

- **WHEN** `accounts` is off and an IP has made 10 reports in 24 hours
- **THEN** its next report request gets 429
