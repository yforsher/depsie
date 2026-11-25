# Tasks

## 1. Daily caps in reports

- [x] 1.1 Load superpowers:test-driven-development with the Skill tool. In `server/src/limits.ts`,
      replace `USER_DAILY_COST` and `ANONYMOUS_DAILY_COST` with `USER_DAILY_REPORTS = 10` and
      `ANONYMOUS_DAILY_REPORTS = 400`, and `checkCostCap` with `checkDailyCap`, which counts today's
      `ai_usage` rows with source `query_expansion` for the user, or for rows with no user; update
      both callers in `server/src/app.ts`. Rewrite the cost cap tests in `app.test.ts`,
      `auth.test.ts` and `reports.test.ts` to insert `query_expansion` rows instead of a cost:
      anonymous 400th row refuses with 429 and no AI call while a signed-in user still gets a
      report; a user's 10 rows refuse with 429 without blocking another user; one row costing $5
      does not refuse; rows from yesterday do not count; a refresh at the cap is 429 with no AI call
      and no version; 503 without the database stays. Check with `pnpm --filter server test`. Load
      superpowers:verification-before-completion with the Skill tool and run its check
- [x] 1.2 Load superpowers:test-driven-development with the Skill tool. Add
      `ANONYMOUS_REPORTS_PER_IP_PER_DAY = 10` to `server/src/limits.ts` and, in `server/src/app.ts`,
      a second `rateLimit` on `POST /api/report` after the hourly one: 24-hour window, keyed by IP,
      skipped for signed-in users, message "the limit is 10 per day". Tests in `app.test.ts`: 10
      anonymous reports, the clock moved past an hour so the hourly limit does not answer, then the
      11th gets 429 naming "10 per day" with no AI call; a signed-in user on the same IP still gets
      a report (`auth.test.ts`). Check with `pnpm --filter server test`. Load
      superpowers:verification-before-completion with the Skill tool and run its check
- [x] 1.3 Update `server/AGENTS.md` (`src/limits.ts`, `POST /api/report` with the per-IP daily
      limit, the refresh endpoint, `ai_usage` in Storage) and `README.md` where they name the
      dollar caps or cost limits, and verify that
      `rg -n "COST|cost cap|cost limit" server/AGENTS.md README.md` finds no daily cost cap and
      `server/AGENTS.md` names the per-IP daily limit

## 2. Usage API and page without dollars

- [x] 2.1 Load superpowers:test-driven-development with the Skill tool. In `shared/src/index.ts`,
      drop `cost` from `UsageDay` and make `UsageResponse` `{ days, todayReports, dailyCap }`
      (reports); in `usageOf()` (`server/src/usage.ts`) stop selecting cost and return
      `todayReports` and `dailyCap: USER_DAILY_REPORTS`. Update the usage tests in `auth.test.ts`:
      days with reports and tokens only, `todayReports: 1`, `dailyCap: 10`; no usage gives
      `{ days: [], todayReports: 0, dailyCap: 10 }`. Check with `pnpm --filter server test`. Load
      superpowers:verification-before-completion with the Skill tool and run its check
- [x] 2.2 Load superpowers:test-driven-development with the Skill tool. In
      `client/src/components/UsagePage.tsx`, show "Today: N of 10 reports" and a table of day,
      reports and tokens, and remove the dollar formatter. Update `UsagePage.test.tsx`: "Today: 1
      of 10 reports", "Today: 0 of 10 reports" with no usage, and no `$` anywhere on the page.
      Check with `pnpm --filter client test`. Load superpowers:verification-before-completion with
      the Skill tool and run its check
- [x] 2.3 Load superpowers:test-driven-development with the Skill tool. In
      `client/src/components/PrivacyNote.tsx`, say tokens and cost are stored "to enforce the daily
      limits and to know what the service costs" instead of "to enforce daily cost limits", and
      update the expected text in `SignInPage.test.tsx`. Check with `pnpm --filter client test`.
      Load superpowers:verification-before-completion with the Skill tool and run its check
- [x] 2.4 Update `client/AGENTS.md` (`UsagePage`, Server API) and `docs/product.md` (usage page:
      reports and tokens per day, today's reports against the daily cap), and verify neither names
      the usage page's cost or `$0.25`

## 3. Integration check

- [x] 3.1 Run `pnpm lint`, `pnpm test` and `pnpm e2e`, and on a local run (`pnpm dev`) signed in,
      run one report and verify `/usage` shows "Today: 1 of 10 reports", one row with 1 report and
      its tokens, and no dollar amount

## 4. Review

- [x] 4.1 Load superpowers:requesting-code-review with the Skill tool, then reproduce and fix every
      Critical and Important finding

## Workflow follow-up

- Archive the change, then check off Part 9's substeps in `docs/plan-platform.md`.
