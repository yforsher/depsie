# Proposal

## Why

Saved reports, history, chat and MCP (Parts 5 and 6, agents plan) all belong to a person, so
Depsie needs accounts before any of them. Every report also costs AI calls, and today the only
limit is 10 reports per hour per IP: nothing caps the daily AI spend. This part adds GitHub
sign-in, hidden behind the `accounts` flag, and cost limits that protect the live app now.

## What Changes

- Sign in with GitHub (Better Auth), asking only for `user:email`. The GitHub
  access token is not stored. A sign-in page says what Depsie reads and that it has no access to
  repositories.
- `GET /api/me`, sign out, and delete account (removes the user, their sessions and all their
  data).
- Every user-owned table has `user_id`, taken from the session, never from the request.
- The `accounts` flag can also be a comma-separated list of GitHub logins: on only for those
  users, so sign-in can be tried on the live URL before it opens to everyone.
- A client router (TanStack Router) for the sign-in and account pages; the anonymous flow is
  unchanged.
- Table `ai_usage`: one row per AI call, with the user when signed in.
- Limits: 10 reports per hour per user (per IP when anonymous, as today); a daily AI cost cap of
  $0.25 per user and $1 shared by all anonymous use. **BREAKING**: reports are refused while the
  database cannot be reached, since the caps cannot be checked; local runs and the e2e smoke test
  then need a database (an in-memory one is supported).

## Capabilities

### New Capabilities

- `accounts`: GitHub sign-in, sessions, what is stored about a user, data ownership and account
  deletion.
- `usage-limits`: recording AI usage and the rate limits and cost caps on reports.

### Modified Capabilities

- `feature-flags`: a flag can be on for a list of GitHub logins only, and `GET /api/features`
  answers per user.

## Impact

- Server: new `src/auth.ts` (Better Auth), `src/limits.ts`, routes `GET /api/me` and
  `/api/auth/*`; `app.ts` (limits, flag per user), `openrouter.ts` (writes `ai_usage`),
  `features.ts`, `db/schema.ts` and a new migration (`user`, `session`, `account`,
  `verification`, `ai_usage`), `db/client.ts` (in-memory database for local runs and e2e),
  `e2e.ts`.
- Client: TanStack Router, sign-in page, account menu and page, `useFeature` unchanged in use.
- Shared: `/api/me` and features types.
- Dependencies: `better-auth` (server and client), `@tanstack/react-router` (client). PGlite stays
  a dev dependency: only local runs and e2e use the in-memory database.
- Setup: two GitHub OAuth apps (local and production); `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` locally and in Secret Manager;
  a small prepaid OpenRouter balance with auto top-up off (or a credit limit on the key).
- Docs: `server/AGENTS.md`, `client/AGENTS.md`, README, `.env.example`, `docs/hosting.md`.
