# feature-flags Specification

## Purpose

Lets a feature ship to production hidden, and be turned on per environment without a code
change, so unfinished features never reach users.

## Requirements

### Requirement: Flags are set per environment

Each flag SHALL be read from an environment variable `FEATURE_<NAME>` (the flag name in upper
case with dashes as underscores). A flag SHALL be on only when its variable is `on`, and off
otherwise, including when the variable is unset. The known flags are `report-links` and
`accounts`.

#### Scenario: Variable set to on

- **WHEN** the server starts with `FEATURE_ACCOUNTS=on`
- **THEN** the `accounts` flag is on

#### Scenario: Variable unset

- **WHEN** the server starts without `FEATURE_REPORT_LINKS`
- **THEN** the `report-links` flag is off

#### Scenario: Any other value

- **WHEN** the server starts with `FEATURE_ACCOUNTS=true`
- **THEN** the `accounts` flag is off

### Requirement: Routes behind an off flag do not exist

A server route behind a flag SHALL return 404, the same as an unknown API path, while its flag
is off, and SHALL work normally while the flag is on.

#### Scenario: Flag off

- **WHEN** a client calls a route behind the `accounts` flag and the flag is off
- **THEN** the server returns 404

#### Scenario: Flag on

- **WHEN** a client calls a route behind the `accounts` flag and the flag is on
- **THEN** the route handles the request

### Requirement: The server lists the enabled flags

`GET /api/features` SHALL return the names of the flags that are on, and only those.

#### Scenario: One flag on

- **WHEN** only `accounts` is on and a client calls `GET /api/features`
- **THEN** the response is `{ "enabled": ["accounts"] }`

#### Scenario: No flag on

- **WHEN** no flag is on and a client calls `GET /api/features`
- **THEN** the response is `{ "enabled": [] }`

### Requirement: The client hides UI behind an off flag

The client SHALL show UI behind a flag only when `GET /api/features` lists that flag. While the
list is loading, or if the call fails, the UI SHALL stay hidden.

#### Scenario: Flag off

- **WHEN** the features list does not include `accounts`
- **THEN** no UI behind `accounts` is rendered

#### Scenario: Flag on

- **WHEN** the features list includes `accounts`
- **THEN** the UI behind `accounts` is rendered

#### Scenario: List not loaded

- **WHEN** the features call is still pending or has failed
- **THEN** no UI behind any flag is rendered, and the anonymous flow works as before
