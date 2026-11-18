## Purpose

Keeps each report so it can be opened again, for only as long as its retention period allows,
and only by the people allowed to see it: a signed-in report by its owner, everything else through
its share link.

## ADDED Requirements

### Requirement: Reports are saved with their versions

Every report SHALL be saved when it is generated: a signed-in user's report while `accounts` is on
for them, and an anonymous report while `report-links` is on; otherwise nothing SHALL be saved, as
today. A saved report SHALL keep its need, framework and sent dependencies, and its versions. A
change to a report SHALL append a version and never edit an earlier one.

#### Scenario: Version contents

- **WHEN** a version is saved
- **THEN** it holds the report, the schema version it was saved with, its source (`pipeline`, `refresh`, `chat` or `agent`) and its creation time

#### Scenario: Anonymous report with report-links on

- **WHEN** an anonymous visitor gets a report while `report-links` is on
- **THEN** the report is saved with no user and version 1 with source `pipeline`, and the response carries its id and deletion date

#### Scenario: Signed-in report

- **WHEN** a signed-in user for whom `accounts` is on gets a report
- **THEN** the report is saved to that user with version 1, and the response carries its id and deletion date

#### Scenario: Flags off

- **WHEN** an anonymous visitor gets a report while `report-links` is off
- **THEN** nothing is saved and the response has no saved report

### Requirement: The report response names the saved report

`POST /api/report` SHALL return the report together with the saved report's id, deletion date and
share id, or no saved report when nothing was saved.

#### Scenario: Saved

- **WHEN** a report is saved
- **THEN** the response carries the report and the saved report's id and deletion date

### Requirement: Reports are kept for a fixed retention period

Each saved report SHALL have a deletion date set from retention periods defined as constants in
one place: an anonymous report without a link 10 days after its creation; an anonymous report with
a link 30 days after its creation; a signed-in report 100 days after its latest version. The date
SHALL be set when the report is saved, when a version is appended and when an anonymous link is
created.

#### Scenario: Anonymous report

- **WHEN** an anonymous report is saved
- **THEN** its deletion date is 10 days after its creation

#### Scenario: Anonymous link created

- **WHEN** a share link is created for an anonymous report
- **THEN** its deletion date becomes 30 days after its creation, not after the link's creation

#### Scenario: Signed-in report

- **WHEN** a signed-in report is saved
- **THEN** its deletion date is 100 days later

#### Scenario: New version of a signed-in report

- **WHEN** a version is appended to a signed-in report
- **THEN** its deletion date becomes 100 days after that version

### Requirement: Expired reports cannot be opened

A report past its deletion date SHALL be treated as if it does not exist (404) by every read,
share and delete, whether or not it has been deleted yet.

#### Scenario: Link opened after the deletion date

- **WHEN** anyone opens the link of an anonymous report after its deletion date
- **THEN** the response is 404

### Requirement: Expired reports are deleted daily

A scheduled job SHALL run daily and delete every report past its deletion date, with all its
versions. It SHALL delete no other report. It SHALL NOT be reachable through any public endpoint.

#### Scenario: Cleanup run

- **WHEN** the cleanup runs with one expired and one current report
- **THEN** the expired report and its versions are gone, and the current one is unchanged

### Requirement: Signed-in reports are private

A signed-in report SHALL open at `/reports/:id` only for its owner, while `accounts` is on for
them. For anyone else, including other signed-in users and anonymous visitors, it SHALL return
404, as if it did not exist. Deleting the account SHALL delete all of the user's reports and their
versions.

#### Scenario: The owner

- **WHEN** the owner opens `/reports/:id`
- **THEN** they see the latest version of the report

#### Scenario: Another user

- **WHEN** another signed-in user requests the same report id
- **THEN** the response is 404 with none of the report's data

#### Scenario: Account deleted

- **WHEN** a user deletes their account
- **THEN** their reports and versions no longer exist

### Requirement: Older saved reports still open

A version saved with an older report schema version SHALL be converted to the current schema when
read. When no conversion exists, it SHALL be shown as saved, read-only, with a note that it was
saved in an older format.

#### Scenario: Report from an older schema

- **WHEN** a report whose latest version has an older schema version is opened
- **THEN** it opens, converted, or as saved with the older-format note

### Requirement: The privacy note describes what is stored

The privacy note SHALL say what is stored for anonymous and signed-in use, for how long, who can
open it, and how to delete a report or revoke a link, and that the only cookie is the session
cookie set after signing in (with the short-lived sign-in state cookie), needed for sign-in to
work. The anonymous storage text SHALL be shown only while `report-links` is on for the visitor,
and the signed-in text only while sign-in exists; otherwise the note SHALL keep saying that no
report is stored.

#### Scenario: report-links on

- **WHEN** a visitor opens the privacy note while `report-links` is on
- **THEN** it says anonymous reports are kept 10 days, or 30 with a link, that anyone with the link can open and delete it, and that there are no cookies without signing in

#### Scenario: Flags off

- **WHEN** a visitor opens the privacy note while both flags are off
- **THEN** it says that no report is stored, as today
