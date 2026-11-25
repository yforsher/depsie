# report-history Specification

## Purpose

Lets a signed-in user come back to their saved reports: list them, open any version, refresh a
report with today's data, and delete it, while only the owner can see or change them.

## Requirements

### Requirement: The owner lists their reports

While `accounts` is on for a signed-in user, the reports page SHALL list that user's unexpired
reports, newest first, each with its need, framework, latest version date, number of versions and
whether it has a share link. It SHALL list no other user's reports and no anonymous reports.

#### Scenario: Own reports only

- **WHEN** a signed-in user with two reports opens the reports page, and another user has one
- **THEN** the page lists exactly their two reports, newest first

#### Scenario: Expired report

- **WHEN** one of the user's reports is past its deletion date
- **THEN** it is not listed

#### Scenario: Not signed in

- **WHEN** an anonymous visitor requests the list
- **THEN** the response is 401

### Requirement: A report shows its versions

A signed-in report opened by its owner SHALL show the list of its versions, each with its number,
source and date, and SHALL open on the latest. The owner SHALL be able to open any earlier
version, read-only. The share link SHALL always show the latest version.

#### Scenario: Earlier version

- **WHEN** the owner opens version 1 of a report that has 2 versions
- **THEN** version 1 is shown, marked as an earlier version, without refresh

#### Scenario: Unknown version

- **WHEN** the owner requests a version number the report does not have
- **THEN** the response is 404

### Requirement: The owner refreshes a report

The owner SHALL be able to refresh a report: the pipeline runs again with the saved need,
framework and dependencies, and a new version with source `refresh` is appended. Earlier versions
SHALL stay unchanged and viewable, and the deletion date SHALL move to 100 days after the new
version.

#### Scenario: Refresh

- **WHEN** the owner refreshes a report that has 1 version
- **THEN** version 2 exists with source `refresh`, built from the same inputs, and the report opens on it

#### Scenario: Share link after a refresh

- **WHEN** a shared report is refreshed
- **THEN** its share link shows version 2

### Requirement: Only the owner can refresh

Refresh SHALL return 401 without a session, and 404 for a report that is not the caller's,
anonymous, expired or missing. No AI call SHALL be made in those cases.

#### Scenario: Without a session

- **WHEN** a request to refresh a report has no session
- **THEN** the response is 401 and no AI call is made

#### Scenario: Another user's report

- **WHEN** a signed-in user refreshes another user's report
- **THEN** the response is 404 and no AI call is made

### Requirement: Refresh counts toward the limits

A refresh SHALL count as one report toward the user's hourly limit and toward the user's daily
report cap, and SHALL be refused with 429 when either is reached, before any AI call.
Its AI usage rows SHALL carry the report's id.

#### Scenario: Hourly limit reached

- **WHEN** a user who has made 10 reports this hour refreshes one
- **THEN** the response is 429 and no version is appended

#### Scenario: Daily cap reached

- **WHEN** a user who has run 10 reports and refreshes today refreshes one
- **THEN** the response is 429, no AI call is made and no version is appended

### Requirement: Shared reports cannot be refreshed

A report opened by its share link SHALL offer no refresh. When its data is older than the
freshness limit, the warning SHALL suggest signing in or running a new report.

#### Scenario: Old shared report

- **WHEN** anyone opens a share link to a report whose data is 10 days old
- **THEN** there is no refresh button, and the warning suggests signing in or running a new report

### Requirement: The owner deletes a report

The owner SHALL be able to delete a signed-in report, after a confirmation, from the reports page
and from the report page. The report and all its versions SHALL be removed, and its share link
SHALL return 404. Deleting from the report page SHALL return to the reports page. Delete SHALL
return 404 for a report that is not the caller's.

#### Scenario: Delete from the report page

- **WHEN** the owner confirms Delete on `/reports/:id`
- **THEN** the report is deleted and the reports page opens without it, and Back does not return to the deleted report

#### Scenario: Delete

- **WHEN** the owner deletes a shared report
- **THEN** the report and its versions are gone, it is no longer listed, and its link returns 404

#### Scenario: Another user's report

- **WHEN** a signed-in user deletes another user's report
- **THEN** the response is 404 and the report stays
