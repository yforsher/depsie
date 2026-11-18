# Spec Delta

## Purpose

Lets anyone keep a report outside Depsie, for example in a pull request or a design document, as
a Markdown file that matches what the report shows on screen.

## ADDED Requirements

### Requirement: Reports download as Markdown

Every view of a report SHALL offer a Markdown download, built in code from the structured report
with no AI call and no server request. It SHALL be available without an account and without a
feature flag.

#### Scenario: Download

- **WHEN** a visitor selects the Markdown download on a report
- **THEN** the browser saves a `.md` file of that report

### Requirement: The Markdown holds every report section

The Markdown SHALL contain the need, framework and generation date, the summary of why the top
package was chosen, the ranking with each candidate's facts, pros and cons, the rejected
alternatives with their reasons, the security and compliance facts with their status labels, and
the data sources with the date each was fetched. Every claim SHALL keep its sources, as on screen.

#### Scenario: Sections and fetch date

- **WHEN** the Markdown of a report is built
- **THEN** it contains every section above, each claim's sources, and each data source's fetch date

#### Scenario: Shown version

- **WHEN** the owner downloads an earlier version of a report
- **THEN** the Markdown is of that version
