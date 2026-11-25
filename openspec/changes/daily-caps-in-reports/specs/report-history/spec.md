# Spec Delta

## MODIFIED Requirements

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
