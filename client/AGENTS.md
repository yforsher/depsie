# Client

React, TypeScript, Vite, TanStack Query, TanStack Router. Tests with Vitest and React Testing
Library.

The client handles the need + framework form, parses package.json locally, shows the "what is
sent" preview, renders the report, and downloads it as Markdown (`src/markdown.ts`), built from
the structured report in the browser, with no AI call and no server request.

## package.json privacy rules

- package.json is optional and can be pasted or uploaded. It is parsed and filtered in the browser
  with no network calls; the raw file is never sent.
- Scoped packages are sent only if their scope is in `allowlist.json`, which a settings field can
  extend.
- Entries whose declared range is not a semver range or dist-tag (for example `git+ssh:`, `git:`,
  `github:`, `file:`, `link:`, `workspace:`, or a URL) are never sent, because they can reveal
  internal hosts and paths.
- Before sending, the preview shows exactly what goes to the server: need, framework, and the
  filtered public dependency names and declared version ranges. It also lists every entry that is
  not sent and why.

## Server API

`POST /api/report` with `{ need, framework, dependencies? }` returns `{ report, saved }` (types in
`shared/`; `saved` is null when the report was not saved),
`POST`/`DELETE /api/reports/:id/share` (create or revoke a link), `GET /api/reports` (the user's
reports), `GET /api/usage` (the user's reports and tokens per day and today's reports against the daily cap), `GET /api/reports/:id?version=N` (the owner's report, latest or version N),
`DELETE /api/reports/:id`, `POST /api/reports/:id/refresh` (a new version, with the same errors
as a new report), `GET`/`DELETE /api/s/:shareId` (a shared report, delete by link),
and `GET /api/features` for the flags on for this visitor and `signIn` (sign-in exists, so
`/signin` is shown even while no sign-in button is).
Show a clear message for each error: 400 (invalid input), 429 (hourly or daily limit), 502 (AI
failure), 503 (reports unavailable while the database is down).

## Color scheme

Dark navy background with light text. Single theme (dark only). All text colors pass WCAG AA
(4.5:1) on every background below.

| Token              | Hex       | Use                                                | Contrast on bg  |
| ------------------ | --------- | -------------------------------------------------- | --------------- |
| `--bg`             | `#0B1426` | Page background                                    | -               |
| `--surface`        | `#13203A` | Cards, table, panels                               | -               |
| `--surface-raised` | `#1B2B4A` | Inputs, hover rows, menus                          | -               |
| `--border`         | `#2A3B5C` | Borders, dividers                                  | decorative      |
| `--text`           | `#E6EDF7` | Primary text, headings                             | 15.6:1          |
| `--text-secondary` | `#A9B6CC` | Body copy, labels                                  | 9.0:1           |
| `--text-muted`     | `#8494AE` | Hints, timestamps, captions                        | 6.0:1           |
| `--accent`         | `#5AB0FF` | Links, primary buttons, focus ring, selected state | 8.0:1           |
| `--accent-hover`   | `#82C4FF` | Hover on accent elements                           | -               |
| `--on-accent`      | `#0B1426` | Text on accent buttons                             | 8.0:1 on accent |
| `--success`        | `#3DD68C` | Recommended package, passing checks                | 9.8:1           |
| `--warning`        | `#F5B84A` | Outdated, low maintenance, license caution         | 10.4:1          |
| `--danger`         | `#FF7A7A` | Known vulnerabilities, incompatible license        | 7.3:1           |

```css
:root {
  --bg: #0b1426;
  --surface: #13203a;
  --surface-raised: #1b2b4a;
  --border: #2a3b5c;
  --text: #e6edf7;
  --text-secondary: #a9b6cc;
  --text-muted: #8494ae;
  --accent: #5ab0ff;
  --accent-hover: #82c4ff;
  --on-accent: #0b1426;
  --success: #3dd68c;
  --warning: #f5b84a;
  --danger: #ff7a7a;
}
```

Rules: use only these tokens, never raw hex in components. Status colors always come with a text
label or icon, never color alone.

## Code structure

- `src/main.tsx`: entry point with the TanStack Query and Router providers.
- `src/router.tsx`: code-based routes. The root route renders the top bar of every page: the
  Depsie wordmark (a link home) and the account menu, in the content column;
  `/` is the report app; `/signin` is the sign-in page while sign-in exists, and redirects home
  otherwise; `/account` is the signed-in user's page, and redirects anyone else to `/signin`
  while sign-in exists, else home; `/reports` lists the signed-in user's reports and
  `/reports/$id` (`?version=N` for an earlier version) is one of them, and `/usage` is the
  user's AI usage, all redirecting the same way; `/s/$shareId` is a shared report for anyone. Any unknown path redirects home (the root route's
  `notFoundComponent`). Redirects replace the history entry, so Back does not return to them.
  Pages that depend on the flags or the user render nothing until both are known, so a
  signed-in user is never sent away by mistake. The server returns the app shell for every non-API path.
- `src/account.ts`: the Better Auth React client (`authClient`, for sign-in, sign-out and delete;
  it looks up `fetch` on each call so tests can stub it) and `useMe()`, which reads
  `GET /api/me` only while `accounts` is on for this visitor.
- `src/components/AccountMenu.tsx`: the right end of the top bar, only while `accounts` is on for
  this visitor: a Sign in link styled as a quiet secondary button (not on `/signin` or `/account`),
  or the avatar with a menu (Reports, Usage, Account, Sign out). Signing out reads the
  flags and the user again, since a login list can depend on the user.
- `src/components/SignInPage.tsx`: what Depsie reads (name, avatar, email), no repository access,
  how to revoke it in GitHub, the privacy note, a way back, in one panel; the GitHub button
  (`GitHubMark.tsx` is GitHub's mark) starts Better Auth's GitHub sign-in, returns to `/` also when
  sign-in is refused, and is disabled after one click so a second click starts no second sign-in.
- `src/components/AccountPage.tsx`: the profile (avatar, name, login, email) in one panel and
  Delete account in another, outlined in the danger color until confirmed, then filled;
  when Better Auth asks for a recent sign-in (`SESSION_EXPIRED`) it says to sign in again.
- `src/testRouter.tsx`: test helper that renders the router at a path with the server calls
  stubbed (`stubServer`), for page tests.
- `src/App.tsx`: runs the report request as a mutation. Two columns from 960px: the form on the
  left, the result column on the right with an empty, loading, error or report state.
- `src/api.ts`: the only module that talks to the server. `fetchReport()` (`POST /api/report`,
  returns `ReportResponse`)
  turns 400, 429, 502, 503 and any other failure status into a clear error message;
  `fetchFeatures()` reads `GET /api/features`; `changeShareLink()`, `fetchOwnedReport()` and
  `fetchSharedReport()` (null on 404), `deleteSharedReport()`; `fetchReports()`, `deleteReport()` and
  `refreshReport()` (its errors read as `fetchReport()`'s); `fetchUsage()`.
- `src/components/ShareControls.tsx`: under a saved report (the result on `/`, with `openLink`, and
  `/reports/$id`): Create share link, then the link with a copy button and the deletion date; for
  a signed-in owner (`saved.owned`) also Revoke link, and on `/` a link to the saved report.
- `src/components/ReportsPage.tsx`: the user's reports, most recently updated first: need (a link
  to the report), framework, date, version count and Shared, with Delete; an empty list says so.
- `src/components/UsagePage.tsx`: "Today: N of 10 reports", then one table row per UTC day of the
  last 30 days with usage, newest first: date, reports and tokens; with no usage it says so. No
  dollar amount anywhere: the user does not pay for the AI calls.
- `src/components/DeleteButton.tsx`: Delete, then Delete permanently or Cancel; used by the reports
  list and the report page.
- `src/components/SavedReportPage.tsx`: the owner's report, latest version or the one in
  `?version`; "Report not found" on 404. The latest gets `ShareControls` and one Refresh button at any
  age: in the old-data warning once it shows, else in the history panel (disabled while it runs;
  the answer becomes the page's data, and the error shows under it). An earlier version says so, links to the latest from the warning, and has
  no Refresh or share controls. Every version shows the version list (number, source, date) and
  Delete report, which returns to `/reports` replacing the history entry, so Back does not reopen
  it; a failed delete stays on the page with its message.
- `src/components/SharedReportPage.tsx`: a shared report, read-only, with its deletion date, and
  for an anonymous report Delete report (confirmed first); with old data its warning links to Sign
  in (while sign-in exists and the viewer is not signed in) and to a new report, since a shared report cannot be refreshed; 404 says the link does not exist or has
  expired.
- `src/components/OlderFormatNote.tsx`: the note over a report saved in an older format.
- `src/features.ts`: `useFeature(name)` is true only when the server lists the flag for this
  visitor; `useSignIn()` is true while sign-in exists; `useFeaturesSettled()` once the flags are
  known. Fetched once per page load; while loading or after a failure the flags are false, so put
  every flagged piece of UI behind them and it stays hidden until the flag is on.
- `src/mockReport.ts`: a fixed report used by the tests.
- `vite.config.ts`: in dev, `/api` is proxied to the Express server on port 3000.
- `src/packageJson.ts`: parsing and privacy filtering (scope allowlist, non-registry ranges).
  `src/allowlist.json` holds the allowed scopes.
- `src/components/RequestForm.tsx`: need, framework, optional package.json, extra scopes,
  validation (need at most 500 characters, at most 200 dependencies).
  Enter in the need or framework field submits once both are filled; Shift+Enter adds a line.
  The need placeholder is picked at random on page load from `src/needExamples.json`.
- `src/components/SentPreview.tsx`: the "what is sent" preview, including entries not sent.
- `src/components/PrivacyNote.tsx`: a "How your data is handled" link under the preview that opens
  the privacy details in a native `<dialog>`. Keep the text in line with the privacy constraints
  in the root `AGENTS.md` whenever they change. The account sentence shows only while sign-in
  exists, and reads the flags only while the note is open. jsdom lacks the dialog methods, so
  `src/test-setup.ts` stubs `showModal()` and `close()`.
- `src/components/ReportView.tsx`: the summary of why the top pick was chosen ("Why <name>")
  above the ranking, since it compares the top two; one card per ranked candidate (the top pick
  marked Recommended, a GitHub badge when there is a repository, the npm description under the
  name) with
  its facts, then pros and cons; rejected alternatives show their cons, with pros and facts
  collapsed; data sources at the bottom. Every fact, pro and con
  ends with its sources, for example "(npm, OSV)". Only OSV and deps.dev are links, since the
  package name already links to npm and the badge to GitHub; all report links open in a new tab.
  Dates show as "Oct 27, 2026" (UTC). Under the title, `Freshness` says when the data was fetched
  (`generatedAt`: every source is fetched in the same request) and how many days ago, measured
  when the report is viewed (`dataAge()` in `shared/`); from `STALE_AFTER_DAYS` (7) it warns that
  releases and vulnerabilities may have changed, with the page's `staleAction` (Refresh for the
  owner, sign in or a new report on a shared page; none on `/`, where a report is always new).
  The header's Download Markdown button saves the report shown as `depsie-<generated date>.md`.
- `src/markdown.ts`: `reportToMarkdown()`, the report as Markdown with the same sections, labels
  and sources as `ReportView` and each data source's fetch date; checked against a file snapshot
  (`src/__snapshots__/report.md`), so review that file when the report shape changes.
- `src/reportFormat.ts`: what `ReportView` and `markdown.ts` share so both read the same: the
  status and fact labels, `uniqueSources()` and `formatDate()` ("Oct 27, 2026", UTC).
- `src/index.css`: color tokens and all styles.
- Tests sit next to the code as `*.test.ts(x)`; `src/test-setup.ts` registers jest-dom and
  cleanup.
- Request and report types come from the `shared` workspace package.
