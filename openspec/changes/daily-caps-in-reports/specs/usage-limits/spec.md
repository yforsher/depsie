# Spec Delta

## ADDED Requirements

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

## RENAMED Requirements

- FROM: `### Requirement: Daily AI cost caps`
- TO: `### Requirement: Daily report caps`

## MODIFIED Requirements

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
