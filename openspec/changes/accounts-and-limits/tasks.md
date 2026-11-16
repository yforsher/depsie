# Tasks

## 1. A database for every run

- [x] 1.1 Load superpowers:test-driven-development with the Skill tool. Test first: with `DATABASE_URL=memory`, `db()` returns a PGlite client with the migrations applied, and two calls return the same client. Make `db()` in `server/src/db/client.ts` a lazily created singleton with the `memory` mode (dynamic import of PGlite), and set `DATABASE_URL=memory` in `server/src/e2e.ts` when unset. Load superpowers:verification-before-completion with the Skill tool and run its check: the test passes, `pnpm e2e` passes, and `server/dist` loads no PGlite code when `DATABASE_URL` is a Neon URL
- [x] 1.2 Document the `memory` mode and that a database is now required for reports in `server/AGENTS.md`, `.env.example` and the README run section; verify the README steps start the app with `DATABASE_URL=memory`

## 2. AI usage and cost caps

- [x] 2.1 Load superpowers:test-driven-development with the Skill tool. Add the `ai_usage` table to `server/src/db/schema.ts` (columns and indexes as in design.md; `user_id` nullable, its foreign key added in 3.2 when `user` exists) and generate the migration. Load superpowers:verification-before-completion with the Skill tool and run its check: `migrations.test.ts` sees the table on a fresh database, `db:generate` reports no changes afterwards, and `db:migrate` on the Neon `dev` branch succeeds
- [x] 2.2 Load superpowers:test-driven-development with the Skill tool. Test first in `app.test.ts`: an anonymous report writes two `ai_usage` rows (sources `query_expansion` and `comparison`, model, tokens, cost, no user), and a call whose answer is rejected still writes its row. Then write the row from `chatJson()` with the user from the per-request context. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass and the `events` row of the report is unchanged
- [x] 2.3 Load superpowers:test-driven-development with the Skill tool. Test first: with $1 of anonymous `ai_usage` today the next report gets 429 and no AI call; yesterday's rows do not count; a failing database gives 503 and no AI call. Then add `server/src/limits.ts` (the constants and `checkCostCap`) to `POST /api/report` after the hourly limit. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass, every existing report test still passes, and `pnpm e2e` passes
- [x] 2.4 Show the 503 and the daily-limit 429 with clear messages in the client (`client/src/api.ts`), test first in its tests, and document `ai_usage` and the limits in `server/AGENTS.md` and `client/AGENTS.md`; verify `pnpm --filter client test` passes

## 3. Sign-in on the server

- [x] 3.1 Load superpowers:test-driven-development with the Skill tool. Check the current Better Auth docs (Context7) for Express, the Drizzle adapter, GitHub, database hooks and `testUtils`, then add `better-auth` to the server. Load superpowers:verification-before-completion with the Skill tool and run its check: `pnpm install`, `pnpm build` and `pnpm test` pass
- [x] 3.2 Load superpowers:test-driven-development with the Skill tool. Generate the Better Auth tables with `npx auth generate` into `server/src/db/schema.ts` with a `githubLogin` user field, add the `ai_usage.user_id` foreign key (on delete cascade), and generate the migration. Load superpowers:verification-before-completion with the Skill tool and run its check: `migrations.test.ts` sees all five tables, and `db:migrate` on the Neon `dev` branch succeeds and leaves `events` unchanged
- [x] 3.3 Load superpowers:test-driven-development with the Skill tool. Test first with a test-only auth instance using `testUtils`: `GET /api/me` returns no user without a session (changed from 401, see design.md) and returns id, name, login, avatar and email with one; sign-out ends the session; the account row written after a GitHub sign-in (GitHub `/user`, `/user/emails` and the token endpoint answered by fixtures) has no access, refresh or ID token, also after a second sign-in; the sign-in redirect asks only for `user:email`. Then add `server/src/auth.ts` (scopes, `getUserInfo`, token clearing, `githubLogin`, `/update-user` disabled, `deleteUser` enabled), mount it before `express.json()` and add `loadUser` and `GET /api/me`. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass and the session cookie in the test response is httpOnly and SameSite=Lax
- [x] 3.4 Load superpowers:test-driven-development with the Skill tool. Test first: deleting the account removes the user, account, sessions and their `ai_usage` rows, leaves other users' rows, and the old session gets no user. Load superpowers:verification-before-completion with the Skill tool and run its check: the test passes
- [x] 3.5 Load superpowers:test-driven-development with the Skill tool. Test first: a signed-in user is limited per user (two users on one IP get 10 each) and by their $0.25 daily cap, while anonymous requests keep the per-IP limit and the shared $1 cap; signed-in reports write `ai_usage` rows with their user. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass

## 4. The accounts flag per user

- [x] 4.1 Load superpowers:test-driven-development with the Skill tool. Test first in `features.test.ts`: `FEATURE_ACCOUNTS=on` is on, unset or empty is off, `alice,Bob` is a list matched without case, `FEATURE_REPORT_LINKS=true` is off. Change the existing `FEATURE_ACCOUNTS: 'true'` expectation (intended: any value other than on is now a login list; the commit says why). Then change `server/src/features.ts`. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass
- [x] 4.2 Load superpowers:test-driven-development with the Skill tool. Test first: with `accounts` off, `/api/auth/*` and `/api/me` return 404 (the first flagged routes, from Part 2); with a list, `/api/me` is 404 for an unlisted signed-in user and works for a listed one; sign-in of an unlisted login creates no user and no session; `GET /api/features` lists `accounts` only for a listed user and reports `signIn`. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass and the anonymous report tests are unchanged
- [x] 4.3 Document the login-list flag and `signIn` in `server/AGENTS.md`, `client/AGENTS.md` and `shared/` types; verify the docs name `FEATURE_ACCOUNTS=<login>` as the way to test on the live URL

## 5. Sign-in in the client

- [x] 5.1 Load superpowers:test-driven-development with the Skill tool. Check the current TanStack Router docs (Context7), add it and the Better Auth React client, and move the app under a root route at `/` with every existing test unchanged. Load superpowers:verification-before-completion with the Skill tool and run its check: `pnpm --filter client test` and `pnpm e2e` pass
- [x] 5.2 Load superpowers:test-driven-development with the Skill tool. Test first: the header shows "Sign in" only when `accounts` is in the features list and nobody is signed in, and the avatar with Account and Sign out when signed in; with the flag off or a list for an anonymous visitor, no sign-in UI. Then add `useMe()` and the header. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass
- [x] 5.3 Load superpowers:test-driven-development with the Skill tool. Test first: `/signin` shows the GitHub button, what is read (name, avatar, email), no repository access, the revoke note, the privacy link and the way back, only while `signIn` is true, else the anonymous app. Then add the page. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass
- [x] 5.4 Load superpowers:test-driven-development with the Skill tool. Test first: `/account` shows the profile and deletes the account after a confirmation, then shows the anonymous app; a "sign in again" message when deletion needs a fresh session. Then add the page. Load superpowers:verification-before-completion with the Skill tool and run its check: the tests pass
- [x] 5.5 Document the router, header and pages in `client/AGENTS.md`; verify the code structure section names each new file

## 6. Setup

- [x] 6.1 Ask the user to create two GitHub OAuth apps (local callback `http://localhost:5173/api/auth/callback/github`, production callback on the live URL), add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to `.env` and to Secret Manager for Cloud Run, and set a credit limit on the OpenRouter key; document all of it in `docs/hosting.md` and `.env.example`; verify a local sign-in with the user's GitHub account works with `pnpm dev`
- [x] 6.2 Update `docs/plan-platform.md`: the answers to Part 4's first item (from design.md), and the "user A gets 404 for any report of user B" test moved to Part 5 with the first user-owned endpoint; verify the Part 4 and Part 5 test lines match

## 7. Integration on the live URL

- [ ] 7.1 After merge with `accounts` off, verify "Smoke live" passes, `GET /api/features` returns no flags, and the live report wrote two `ai_usage` rows with no user
- [ ] 7.2 With the user's approval, set `FEATURE_ACCOUNTS=<the user's login>` on Cloud Run and verify on the live URL: no sign-in button for an anonymous visitor; `/signin` works for the user; GitHub's consent screen lists only read access to email addresses; the session cookie is httpOnly, secure and SameSite=Lax; a second GitHub account is refused with no user row created; sign-out works; then set the flag back to off and record the results in `docs/plan-platform.md`

## 8. Code review

- [x] 8.1 Load superpowers:requesting-code-review with the Skill tool, then reproduce and fix every Critical and Important finding

## Workflow follow-up

- Archive the change with `openspec-archive-change`, then check off Part 4's substeps in `docs/plan-platform.md` and record its measurements there.
