# Design

## Context

`server/src/limits.ts` holds `USER_DAILY_COST` ($0.25) and `ANONYMOUS_DAILY_COST` ($1), and
`checkCostCap` sums today's `ai_usage.cost` for the user (or for all rows without a user) before
`POST /api/report` and `POST /api/reports/:id/refresh`. `usageOf()` in `server/src/usage.ts`
already counts reports per day as rows with source `query_expansion` and returns `todayCost` and
`dailyCap: USER_DAILY_COST`; `UsagePage` prints both in dollars. `ai_usage` has one row per AI
call, written as soon as OpenRouter reports the usage, with `day` (UTC date) and no time.

## Goals / Non-Goals

**Goals:**

- Daily caps counted in reports: 10 per signed-in user, 400 for all anonymous use, per UTC day.
- No dollar amount in any limit, in `GET /api/usage` or on the usage page.

**Non-Goals:**

- Changing the hourly limits (10 per hour per signed-in user, else per IP).
- Stopping the recording of tokens and cost in `ai_usage`, logs and traces: the operator still
  needs them to know what the service costs.
- A database migration or a new column.

## Decisions

- **A report is a `query_expansion` row.** Every report and refresh makes that call exactly once,
  first, and its row is written even when the report fails later, so failed reports and refreshes
  count, and the count is the same one the usage page already shows. Counting saved reports
  instead was rejected: anonymous reports are not always saved, and failed reports cost money but
  save nothing. A request rejected before the first AI call (400, 429, 503) writes no row and does
  not count.
- **One check, renamed.** `checkCostCap` becomes `checkDailyCap`, counting
  `count(*) where source = 'query_expansion' and day = today` for the user, or for rows with no
  user. Constants: `USER_DAILY_REPORTS = 10`, `ANONYMOUS_DAILY_REPORTS = 400`. Same 429 message
  and same 503 when the database cannot be reached.
- **400 for anonymous use.** At about $0.0023 per report that is about $0.92, the same bound as
  the old $1 cap, and it is still shared by all anonymous use so a burst from many IPs has a fixed
  daily cost.
- **No cost in the usage API.** `UsageDay` drops `cost` and `UsageResponse` becomes
  `{ days, todayReports, dailyCap }`, with `dailyCap` the user's report cap. The plan only asked to
  drop the cost column on the page, but the response is the user's too, so a cost left there would
  still show what their usage costs the operator. `todayReports` is taken from today's row of
  `days`, as `todayCost` is now.
- **Per-IP daily limit in memory.** A second `rateLimit` instance in `app.ts`, next to the hourly
  one: `windowMs` 24 hours, limit `ANONYMOUS_REPORTS_PER_IP_PER_DAY = 10` (in `limits.ts`), keyed
  by `ipKeyGenerator(req.ip)`, with `skip` for signed-in users, and the message "the limit is 10
  per day". Each IP's window starts at its first request (express-rate-limit docs). Order: hourly
  limit, `checkDailyCap`, then the per-IP daily limit, so reports the shared cap refuses do not
  use up an IP's 10 (the code review's finding: retries at 23:00 UTC would otherwise block the IP
  until the next evening). Only on `POST /api/report`: a refresh needs a
  session. Like the hourly limit it counts every anonymous request that reaches it, including one
  later refused as invalid input. Kept in memory, not in `ai_usage`, because storing an IP is
  forbidden and `ai_usage` has none.
- **Privacy note wording.** "stored ... to enforce daily cost limits" becomes "to enforce the
  daily limits and to know what the service costs", since the limits now read only the row count.
  What is stored does not change.

## Risks / Trade-offs

- [A report's cost is no longer bounded by a dollar check] -> The model is fixed in code and output
  is capped at 8,000 tokens per call, so one report stays at a few tenths of a cent; the operator
  sees the cost in `ai_usage` and the traces, and the caps are constants to tune.
- [Changing the model to a pricier one would raise the daily bound with it] -> Revisit the caps
  whenever `MODEL` changes, as part of that change.
- [Concurrent requests can pass the check together and run a few reports over the cap] -> Same as
  the dollar cap today; the hourly limit bounds it.
- [A restart or a new revision resets the per-IP counts] -> Accepted while there is one instance;
  the anonymous total of 400 is in the database and still holds.
- [A new IP gets around the per-IP limit] -> Same as the hourly limit; the 400 total bounds it.
- [People behind one IP, such as an office, share 10 anonymous reports a day] -> They can sign in
  to get 10 each.
- [Client and server response shape change together] -> They ship in one revision, served by the
  same server, so no old client calls the new API.
