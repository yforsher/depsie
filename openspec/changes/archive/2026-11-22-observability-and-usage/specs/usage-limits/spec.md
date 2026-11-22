## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Signed-in users see their usage

`GET /api/usage` SHALL return, for the session's user only and from `ai_usage` only, the reports
run, tokens and cost of each UTC day with usage in the last 30 days, today's cost and the daily cap.
It SHALL answer 401 without a session and 404 while `accounts` is not on for the caller. `/usage`
SHALL show it, linked from the account menu, and redirect like `/account`.

#### Scenario: Usage over several days

- **WHEN** a signed-in user made 2 reports yesterday and 1 today
- **THEN** the usage page lists both days with their reports, tokens and cost, and today's cost
  against the $0.25 cap

#### Scenario: Another user's usage

- **WHEN** another user and anonymous visitors also made reports
- **THEN** none of their usage is counted

#### Scenario: No usage

- **WHEN** a signed-in user has made no report in 30 days
- **THEN** the page says there is no usage yet and shows $0 of the cap used today

#### Scenario: Not signed in

- **WHEN** a request without a session calls `GET /api/usage`
- **THEN** the response is 401
