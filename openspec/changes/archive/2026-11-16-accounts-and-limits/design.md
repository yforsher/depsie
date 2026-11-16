# Design

## Context

- The server is one Express 5 app (`createApp()`), with `POST /api/report` rate limited to 10 per
  hour per IP in memory (one Cloud Run instance). Feature flags are read once at startup;
  `GET /api/features` returns the same list to everyone.
- The database is Neon, used through Drizzle: the HTTP driver for queries, the WebSocket pool for
  migrations. Tests use PGlite built from the migrations by mocking `./db/client.js`.
- `chatJson()` in `openrouter.ts` gets tokens and cost from each OpenRouter answer and passes them
  to analytics (`addUsage()`), which sums them into the anonymous `events` row. `events` must never
  be linked to users.
- The client is one page (`App.tsx`) with TanStack Query; `useFeature()` hides flagged UI. Vite
  proxies `/api` to the server in development.
- The e2e smoke test runs the real server with fixture answers and no database.

## Goals / Non-Goals

**Goals:**

- Sign-in that can be switched on for one GitHub login on the live URL before it opens to all.
- Cost limits that hold even when the accounts flag is off.

**Non-Goals:**

- No reports, history or share links stored yet (Parts 5 and 6); account deletion cascades to
  whatever rows exist, so Part 5's tables only add their foreign keys.
- No usage page (Part 7); `ai_usage` is written and read only by the caps.
- No email sign-in, email verification or password handling: GitHub is the only sign-in.

## Decisions

**Better Auth 1.7 with its Drizzle adapter, no transactions.** Answers to Part 4's first item:

- The Drizzle adapter uses interactive transactions only when `transaction: true` is set, so the
  Neon HTTP driver works as is. Deleting a user, and in Part 5 a report with its versions, needs
  no transaction: every user-owned table references `user.id` with `ON DELETE CASCADE`, so one
  delete removes everything. The WebSocket driver stays only for migrations.
- Better Auth stores the GitHub access token in `account` by default. Depsie never calls GitHub
  for the user after sign-in, so `databaseHooks.account.create.before` and `update.before` clear
  `accessToken`, `refreshToken` and `idToken` (and their expiry) before the row is written.
  Alternative: `account.encryptOAuthTokens` keeps an encrypted token that nothing uses.

The tables (`user`, `session`, `account`, `verification`) come from `npx auth generate` into
`src/db/schema.ts`, then a normal `db:generate` migration. `src/auth.ts` builds the Better Auth
instance from `db()`; it is created only when `accounts` is on or a list, so with the flag off
Better Auth and its secrets are not needed.

**GitHub sign-in.** Scope `user:email` only (`disableDefaultScope` plus an explicit list, so a
future default cannot widen it). Changed during implementation from `read:user` and `user:email`:
GitHub's docs say no scope already gives read access to public profile info (name, login,
avatar), and `read:user` added "read your private profile information" to the consent screen. A custom `getUserInfo` reads `/user` and
`/user/emails` with the token, takes the verified primary email, and returns `null` when
`accounts` is a list without that login: Better Auth then creates no user and no session, which
is where its docs say an allowlist must be enforced. The login is stored in a `githubLogin` user
field; since that field accepts provider input, the `/update-user` endpoint is disabled (Depsie
has no profile editing), so no request can set it. Settings: `BETTER_AUTH_URL` (the public
origin; the cookie is `secure` when it is HTTPS), `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`. Locally the origin is the Vite server (`http://localhost:5173`), whose
proxy forwards `/api/auth` to Express, so the cookie is set on the page's own origin.

**Mounting.** `app.all('/api/auth/*splat', toNodeHandler(auth))` before any `express.json()`,
registered only when `accounts` is not off. Better Auth's cookie defaults are httpOnly and
SameSite=Lax; its own rate limit on auth routes stays on.

**Flags per user.** `features.ts` reads each flag as on, off or a list of logins: for `accounts`,
`on` is on, unset, empty or `off` is off, and any other value is a list (so `FEATURE_ACCOUNTS=true` now
means the login `true`, not off; the existing test for it moves to `report-links`, which stays
on/off). `enabledFor(flags, login)` answers for a request. Routes behind `accounts` are registered when it is
not off, and a `requireAccounts` middleware returns the same 404 as an unknown path when the
caller is not allowed. `GET /api/features` reads the session whenever sign-in exists (simpler
than only for a list, and the same cost: one session lookup), and adds `signIn: true` when `accounts` is on or a list, so the client can show `/signin` by URL
without a button. Alternative: a separate `/api/signin-available` route, one more endpoint for one
boolean.

**Users from the session only.** `loadUser` puts the session's user (or none) in `res.locals`;
handlers read the user only from there. `GET /api/me` answers `null` without a session, not 401
(changed during implementation: browsers log every 4xx as a console error); the `requireUser`
middleware that answered 401 was then unused and removed, and Part 5 adds it with its routes. Part 4 has no
endpoint returning user-owned rows besides `/api/me`, so "user A gets 404 for user B's report"
moves to Part 5 with the first such endpoint, as Part 2 moved its 404 test.

**`ai_usage`.** Columns: `id`, `user_id` (nullable, references `user.id` on delete cascade),
`source`, `model`, `prompt_tokens`, `completion_tokens`, `cost`, `day`; index on `(day)` and
`(user_id, day)`. `day` is the UTC date only, not a timestamp (changed after review: a time would
let a user's calls be matched to the anonymous `events` rows by when they happened). `chatJson()`
writes one row per answer as soon as the usage is known, before the answer is validated, not
awaited and logged on failure like analytics. The user comes from its own per-request
`AsyncLocalStorage` (`usageUser`), not the analytics one, so `events` never sees a user.

**Limits in `src/limits.ts`.** Constants: 10 reports per hour, $0.25 per user per day, $1 per day
for all anonymous use. The hourly limiter keys on the user id, else `ipKeyGenerator(req.ip)`.
`checkCostCap` sums today's (UTC) `ai_usage.cost` for the user, or for `user_id IS NULL`, and
answers 429 at or above the cap. If the query fails it answers 503, so no report runs unchecked
(chosen by the user). Order on `POST /api/report`: logging, analytics, `loadUser`, hourly limit,
cost cap, body parser, handler. Two concurrent requests can both pass just under a cap; the
overshoot is at most one report (about $0.002), and a small prepaid OpenRouter balance with auto
top-up off is the backstop (chosen by the user instead of a key credit limit).

**Fixes from the code review.**

- Session rows store no IP address and no User-Agent: a `session.create.before` hook clears both
  (Better Auth fills them by default). Better Auth still reads the IP for its rate limit.
- The production image sets `NODE_ENV=production` after the build, which turns on Better Auth's
  rate limit on the auth routes and its refusal to start without `BETTER_AUTH_SECRET`.
- `FEATURE_ACCOUNTS=off` is off, not the login `off`.
- `loadUser` answers 503 when the session cannot be read, like the cost check, and forwards the
  renewed session cookie that Better Auth sends when it extends a session over a day old.
- The profile is refreshed at each sign-in (`overrideUserInfoOnSignIn`), so a GitHub rename
  reaches the stored login the flag checks.
- A sign-in that did not complete returns to `/signin?error=...`, which says so.
- `events` no longer records tokens or cost (chosen by the user): they equalled the sum of a
  report's `ai_usage` rows, so a signed-in user's rows could be matched to the anonymous row.
  `ai_usage` is now the only record of AI usage. The old columns stay, unused, until Part 5 drops
  them (add first, remove later).

**A database is required, an in-memory one is allowed.** `db()` becomes a lazily created
singleton. `DATABASE_URL=memory` starts PGlite in the process and applies the migrations (dynamic
import, so production never loads it). `e2e.ts` sets it when unset, so the smoke test runs with
a real schema; local development can use it or the Neon `dev` branch.

**Client.** TanStack Router, code-based routes: `/` (the current app), `/signin`, `/account`.
A header shows "Sign in" when `useFeature('accounts')` is on and nobody is signed in, or the
avatar with a menu (Account, Sign out) when signed in. `useMe()` reads `GET /api/me` with
TanStack Query. Sign-in, sign-out and delete use the Better Auth React client
(`better-auth/react`). `/account` shows the profile and a delete button with a confirmation.
Alternative: plain `fetch` calls to the auth routes, which re-implements the redirect handling.

## Risks / Trade-offs

- [A GitHub login can be renamed and later taken by someone else] → the login list is only for
  short tests on the live URL, checked at each sign-in; the flag is removed after Part 6.
- [Stale sessions after a login is removed from the list] → `requireAccounts` checks the stored
  login on every request, so a removed login loses access at once.
- [Reports stop when Neon is down] → chosen on purpose; Neon outages are rare and visible in the
  logs, and the anonymous flow had no other dependency on the database.
- [`getUserInfo` re-implements GitHub's profile and email lookup] → two documented GitHub calls,
  covered by tests with fixture answers; checked against the Better Auth docs while building.
- [Delete account needs a fresh session in Better Auth] → the account page shows "sign in again"
  when Better Auth refuses for that reason.

## Migration Plan

1. One migration adds `user`, `session`, `account`, `verification` and `ai_usage`; nothing
   existing changes, so it is safe with the running revision.
2. Create the GitHub OAuth apps and secrets, deploy with `accounts` off: production sees only the
   new cost caps and the `ai_usage` rows.
3. Set `FEATURE_ACCOUNTS=<the user's login>` on Cloud Run, check sign-in, a second account and
   delete on the live URL, then set it back; turning it on for everyone stays for after Part 6.

Rollback: revert the revision; the new tables are unused by the old code.
