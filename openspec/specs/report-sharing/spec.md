# report-sharing Specification

## Purpose

Lets a developer show a report to a teammate or reviewer with an unguessable read-only link, which
its owner can revoke, or, for an anonymous report, anyone with the link can delete.

## Requirements

### Requirement: Share links are unguessable

A share link SHALL use a share id of at least 128 random bits, encoded as base64url, different
from the report id. Each new link SHALL get a new share id.

#### Scenario: Link created

- **WHEN** a share link is created
- **THEN** its share id has at least 128 random bits in base64url and does not reveal the report id

### Requirement: A shared report opens read-only without signing in

A report with a share id SHALL open at `/s/:share_id` for anyone, without signing in, showing its
latest version read-only (no refresh, no chat, no new versions). The share page and its data
SHALL be sent with `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`. A share id that
does not exist, was revoked, or belongs to an expired report SHALL return 404.

#### Scenario: Opening a link in another browser

- **WHEN** a visitor who is not signed in opens a share link
- **THEN** they see the latest version of the report, with no way to change it

#### Scenario: Headers

- **WHEN** a share page or its data is requested
- **THEN** the response has `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`

#### Scenario: Not shared

- **WHEN** anyone requests `/s/` with a share id no report has
- **THEN** the response is 404

### Requirement: Anonymous reports get a link with a button

While `report-links` is on, the result of an anonymous report SHALL have a button that creates a
share link. Only the visitor who got the report SHALL be able to create it, by knowing the saved
report's id, which is returned only to them. Creating it SHALL show the link with a copy button and
the deletion date. Creating a link again for the same report SHALL return the existing link.

#### Scenario: Create a link

- **WHEN** an anonymous visitor selects the share button on their result
- **THEN** the link and its deletion date, 30 days after the report's creation, are shown with a copy button

#### Scenario: Flag off

- **WHEN** `report-links` is off
- **THEN** no share button is shown and the share endpoints for anonymous reports return 404

### Requirement: Anonymous reports can be deleted from the link

The share page of an anonymous report SHALL have a delete button. Deleting SHALL remove the report
and all its versions at once, after which the link returns 404. A signed-in report SHALL NOT be
deletable through its share link.

#### Scenario: Delete by link

- **WHEN** a visitor deletes an anonymous report from its share page
- **THEN** the report and its versions are gone and the link returns 404

#### Scenario: Signed-in report

- **WHEN** anyone tries to delete a signed-in report through its share link
- **THEN** the response is 404 and the report is unchanged

### Requirement: Owners share and revoke their reports

The owner of a signed-in report SHALL be able to create a share link (shown with a copy button) and
revoke it. Revoking SHALL clear the share id, so the old link returns 404; a link created afterwards
SHALL get a new share id that works. Only the owner SHALL be able to create or revoke; for anyone
else the report SHALL not exist (404). Until a link is created, the report SHALL not open at
`/s/`.

#### Scenario: Revoke

- **WHEN** the owner revokes the link
- **THEN** the old link returns 404

#### Scenario: New link after revoking

- **WHEN** the owner creates a link after revoking one
- **THEN** the new link has a different share id and opens the report

#### Scenario: Another user

- **WHEN** another signed-in user tries to create or revoke a link for the report
- **THEN** the response is 404 and nothing changes
