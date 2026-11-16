# feature-flags Specification

## Purpose

Lets a feature ship to production hidden, and be turned on per environment without a code
change, so unfinished features never reach users.

## Requirements

### Requirement: Flags are set per environment

Each flag SHALL be read from an environment variable `FEATURE_<NAME>` (the flag name in upper
case with dashes as underscores). A flag SHALL be on only when its variable is `on`, and off
otherwise, including when the variable is unset. The `accounts` flag SHALL also accept a
comma-separated list of GitHub logins (compared without regard to case): any value other than
`on`, `off`, unset or empty is such a list, and the flag is then on only for signed-in users with one of
those logins, and off for everyone else. The known flags are `report-links` and `accounts`.

#### Scenario: Variable set to on

- **WHEN** the server starts with `FEATURE_ACCOUNTS=on`
- **THEN** the `accounts` flag is on

#### Scenario: Variable unset

- **WHEN** the server starts without `FEATURE_REPORT_LINKS`
- **THEN** the `report-links` flag is off

#### Scenario: Any other value

- **WHEN** the server starts with `FEATURE_REPORT_LINKS=true`
- **THEN** the `report-links` flag is off

#### Scenario: Off

- **WHEN** the server starts with `FEATURE_ACCOUNTS=off`
- **THEN** the `accounts` flag is off, not a list with the login `off`

#### Scenario: List of logins

- **WHEN** the server starts with `FEATURE_ACCOUNTS=alice,bob`
- **THEN** the `accounts` flag is on for signed-in users `alice` and `bob` only

### Requirement: Routes behind an off flag do not exist

A server route behind a flag SHALL return 404, the same as an unknown API path, while its flag
is off, and SHALL work normally while the flag is on. While `accounts` is a list of logins, its
routes SHALL work only for the listed users, sign-in SHALL succeed only for a listed login, and
everyone else SHALL get the same 404 or a refused sign-in with no account created.

#### Scenario: Flag off

- **WHEN** a client calls a route behind the `accounts` flag and the flag is off
- **THEN** the server returns 404

#### Scenario: Flag on

- **WHEN** a client calls a route behind the `accounts` flag and the flag is on
- **THEN** the route handles the request

#### Scenario: Listed login signs in

- **WHEN** `accounts` is `alice` and `alice` signs in through `/signin`
- **THEN** sign-in succeeds and her routes work

#### Scenario: Unlisted login signs in

- **WHEN** `accounts` is `alice` and `mallory` completes GitHub sign-in
- **THEN** no user or session is created and `mallory` is returned to `/signin` with an error

### Requirement: The server lists the enabled flags

`GET /api/features` SHALL return the names of the flags that are on for the caller, and only
those. A flag on for a list of logins SHALL be listed only for a signed-in listed user.

#### Scenario: One flag on

- **WHEN** only `accounts` is on and a client calls `GET /api/features`
- **THEN** the response has `"enabled": ["accounts"]`

#### Scenario: No flag on

- **WHEN** no flag is on and a client calls `GET /api/features`
- **THEN** the response has `"enabled": []`

#### Scenario: List of logins

- **WHEN** `accounts` is `alice`, and `alice` signed in and an anonymous visitor each call
  `GET /api/features`
- **THEN** `alice` gets `"enabled": ["accounts"]` and the visitor gets `"enabled": []`

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

### Requirement: No sign-in button while accounts is a list

While `accounts` is a list of logins, the client SHALL show no sign-in button. The sign-in page at
`/signin` SHALL be shown only while sign-in is possible (`accounts` on or a list), which
`GET /api/features` reports as `signIn: true`; otherwise `/signin` redirects home.

#### Scenario: Anonymous visitor on the live URL

- **WHEN** `accounts` is a list and an anonymous visitor opens the app
- **THEN** no sign-in button or account UI is shown, and the app looks as it does with the flag off

#### Scenario: Sign-in page by URL

- **WHEN** `accounts` is a list and a visitor opens `/signin`
- **THEN** the sign-in page is shown

#### Scenario: Sign-in page with the flag off

- **WHEN** `accounts` is off and a visitor opens `/signin`
- **THEN** they are redirected to `/`, with no sign-in UI
