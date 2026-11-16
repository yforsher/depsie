# Spec Delta

## Purpose

Lets a developer sign in with GitHub so their reports, history and limits belong to them, while
storing as little as possible about them and keeping anonymous use available.

## ADDED Requirements

### Requirement: Sign in with GitHub, reading only the email addresses

Sign-in SHALL use GitHub OAuth and SHALL request only the `user:email` scope; name, login and
avatar come from the public profile, which needs no scope. It SHALL never request private profile
data or repository access.

#### Scenario: Consent screen

- **WHEN** a user starts sign-in
- **THEN** GitHub's consent screen asks only for read access to the email addresses

### Requirement: Only the profile is stored, not the GitHub token

After sign-in the server SHALL store the user's GitHub name, login, avatar URL and verified primary
email, and SHALL NOT store the GitHub access, refresh or ID token, nor the IP address or browser
(User-Agent) of a session.

#### Scenario: First sign-in

- **WHEN** a user signs in for the first time
- **THEN** a user row exists with name, login, avatar and email, and the account row has no token

#### Scenario: Later sign-in

- **WHEN** the same user signs in again
- **THEN** the account row still has no token

#### Scenario: Session details

- **WHEN** a user signs in from an IP address with a browser
- **THEN** the session row stores neither the IP address nor the User-Agent

### Requirement: The sign-in page explains what is read

The sign-in page SHALL state that Depsie reads the name, avatar and email, has no access to
repositories, that access can be revoked in GitHub settings, and SHALL link to the privacy note.
Anonymous use SHALL stay available from it.

#### Scenario: Opening the sign-in page

- **WHEN** a visitor opens the sign-in page
- **THEN** it shows the GitHub button, what is read, the revoke note, the privacy link and a way back to the anonymous form

### Requirement: The session is a secure cookie

The session SHALL be kept in an httpOnly, SameSite=Lax cookie, marked secure on HTTPS. Besides a
short-lived state cookie while a sign-in is under way (which protects it against forgery), it
SHALL be the only cookie Depsie sets.

#### Scenario: Signed in on the live URL

- **WHEN** a user signs in on the HTTPS live URL
- **THEN** the session cookie is httpOnly, secure and SameSite=Lax

### Requirement: The current user endpoint

`GET /api/me` SHALL return the signed-in user's id, name, login, avatar and email, or 200 with
`null` without a valid session (not 401, which browsers log as a console error on every visit).

#### Scenario: Signed in

- **WHEN** a signed-in user calls `GET /api/me`
- **THEN** the response is 200 with their profile

#### Scenario: Not signed in

- **WHEN** a request without a session calls `GET /api/me`
- **THEN** the response is 200 with `null`

### Requirement: Users sign out

A signed-in user SHALL be able to sign out, which ends the session on the server.

#### Scenario: Sign out

- **WHEN** a user signs out
- **THEN** their session no longer works and `GET /api/me` returns `null`

### Requirement: User data is owned by the session's user

Every table holding a user's data SHALL have a `user_id`. Every read and write of such data SHALL
take the user from the session, never from the request, so one user can never reach another
user's data.

#### Scenario: Another user's data

- **WHEN** user A asks for data that belongs to user B, using B's id in the request
- **THEN** the server answers as if the data does not exist (404), and returns none of B's data

### Requirement: The account page is for signed-in users only

`/account` SHALL be shown only to a signed-in user. Anyone else SHALL be redirected: to `/signin`
while sign-in exists, otherwise to `/`.

#### Scenario: Not signed in

- **WHEN** a visitor who is not signed in opens `/account` while sign-in exists
- **THEN** they are redirected to `/signin`

#### Scenario: Sign-in does not exist

- **WHEN** `accounts` is off and a visitor opens `/account`
- **THEN** they are redirected to `/`

### Requirement: Users delete their account

A signed-in user SHALL be able to delete their account. Deletion SHALL remove the user, their
GitHub account link, their sessions and every row that holds their data, including their AI usage
rows.

#### Scenario: Delete account

- **WHEN** a user deletes their account
- **THEN** no row in any table refers to them, and their session no longer works

### Requirement: Anonymous use is unchanged

Everything an anonymous visitor can do today SHALL keep working without an account.

#### Scenario: Report without an account

- **WHEN** a visitor who is not signed in submits the form
- **THEN** they get a report as before
