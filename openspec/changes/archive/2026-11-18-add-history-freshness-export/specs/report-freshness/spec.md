# Spec Delta

## Purpose

Tells anyone reading a report how old its data is, so a report kept for days or months is not
mistaken for current package data.

## ADDED Requirements

### Requirement: Every report shows its data age

Every view of a report (the result of the form, the owner's saved report and a shared report)
SHALL show the date its data was fetched and how many whole days ago that was, measured at the
time it is viewed.

#### Scenario: New report

- **WHEN** a report is shown right after it was generated
- **THEN** it shows today's fetch date and that it was fetched today

#### Scenario: Older saved report

- **WHEN** a report whose data was fetched 3 days ago is opened
- **THEN** it shows the fetch date and "3 days ago"

### Requirement: Old data gets a warning

From 7 days after the fetch date, the report SHALL show a warning that releases and
vulnerabilities may have changed since the data was fetched. The 7 days SHALL be one constant
shared by client and server.

#### Scenario: Day 6

- **WHEN** a report's data is 6 days old
- **THEN** no warning is shown

#### Scenario: Day 7

- **WHEN** a report's data is 7 days old
- **THEN** the warning is shown

#### Scenario: Day 30

- **WHEN** a report's data is 30 days old
- **THEN** the warning is shown

#### Scenario: Owner's old report

- **WHEN** the owner opens their report whose data is 10 days old
- **THEN** the warning offers a refresh
