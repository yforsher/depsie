## MODIFIED Requirements

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

### Requirement: AI usage cannot be linked to analytics

AI tokens and cost SHALL be recorded only in `ai_usage`, with the UTC day of each call and not its
time. The anonymous `events` table SHALL have no token or cost columns, so a signed-in user's AI
usage cannot be matched to its rows by time or by numbers.

#### Scenario: A report

- **WHEN** a report finishes
- **THEN** its `events` row has no tokens or cost, and its `ai_usage` rows have the day but no time

#### Scenario: Events columns

- **WHEN** the migrations of this change are applied
- **THEN** `events` has no `prompt_tokens`, `completion_tokens` or `cost` column, and its existing rows are kept
