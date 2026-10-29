# Finished parts

Parts 1 to 11 of `plan.md`, moved here once done. Kept for the measurements and decisions
recorded along the way.

## Part 1: Plan

- [x] Enrich this document with substeps, tests and success criteria per part
- [x] User reviews and approves the plan

Success criteria: the user approves this document.

## Part 2: Scaffolding

- [x] `git init`
- [x] `.gitignore` (node_modules, dist, .env)
- [x] Project name: `dependency-decision`
- [x] Public GitHub repo: https://github.com/yforsher/dependency-decision
- [x] Root `package.json` and `pnpm-workspace.yaml` with `client`, `server` and `shared` (types
      used by both)
- [x] `tsconfig.base.json` (strict), extended by each package as it is created (`server/` in
      Part 3, `client/` and `shared/` in Part 4)
- [x] ESLint (flat config, typescript-eslint) and Prettier at the root
- [x] Root scripts: `lint`, `format`, `test`, `build`, `dev`
- [x] `.env.example` with `OPENROUTER_API_KEY`, `GITHUB_TOKEN`
- [x] GitHub Actions workflow: install, lint, test on push and pull request
- [x] Minimal README: what it is, how to run, how to test

Tests: none yet beyond tooling.

Success criteria: `pnpm install` and `pnpm lint` succeed on a clean clone; CI workflow file is valid.

## Part 3: Express backend

- [x] `server/` package: Express, TypeScript, `tsx` for dev, Vitest, Supertest
- [x] `createApp()` separated from `listen()` so tests need no port
- [x] `GET /api/health` returns `{ status: "ok" }`
- [x] Load env from `.env`; port from `PORT` with a default

Tests: Supertest hits `/api/health` and gets 200 with the expected body.

Success criteria: `pnpm --filter server dev` serves the health endpoint; `pnpm test` passes.

## Part 4: Frontend with mock data

- [x] `client/` from the Vite React + TypeScript template; TanStack Query, Vitest, React Testing Library
- [x] Color tokens from AGENTS.md in a global CSS file; dark theme only
- [x] Request and report types in `shared/`, used later by the server too
- [x] Mock API module returning a fixed report, behind the same function the real API will use
- [x] Need input + framework select form
- [x] Optional package.json paste or upload, parsed in the browser with no network calls
- [x] Move the existing root `allowlist.json` into `client/src/` so it is bundled into the client
- [x] Scope filtering: scoped packages are kept only if their scope is in `allowlist.json`; a
      settings field extends the allowlist
- [x] Non-registry filtering: drop any entry whose declared range is not a semver range or dist-tag
      (`git+ssh:`, `git:`, `github:`, `file:`, `link:`, `workspace:`, URLs)
- [x] "What is sent" preview: need, framework, and filtered public dependency names and declared
      version ranges; separately lists every entry not sent and why (scope not allowed, non-registry);
      explains that the package.json itself is never sent
- [x] Report view: ranking, reasons, rejected alternatives, security and compliance, data sources and fetch date
- [x] Express serves the built client (`client/dist`) as static files, with SPA fallback
- [x] Fill in the "Code structure" section of `client/AGENTS.md`

Tests:

- Unit: package.json parsing; scope allowlist filtering (allowed, not allowed, extended in
  settings); non-registry filtering for each listed protocol and for URLs; what-is-sent preview
  lists sent and not-sent entries
- Component: form validation, report rendering from the mock
- Integration: full flow from form submit to rendered report with the mock API
- Server: static file serving returns `index.html` for `/` and unknown client routes

Success criteria: `pnpm build` then starting the server shows the full app working on mock data;
all tests pass; status colors always have a text label.

## Part 5: AI call 1, query expansion

- [x] Verify the endpoints used in this part (npm search, npm package metadata, OpenRouter; see
      `server/AGENTS.md`) by calling each once by hand and recording the response shape in
      `docs/endpoints.md`
- [x] Model: `openai/gpt-oss-120b` for both AI calls (chosen for cost). Route only to providers
      that support structured output (`provider.require_parameters: true`) and confirm with a real
      call. Keep the model ID in one place so it can be swapped later
- [x] OpenRouter client using structured JSON output; validate the response with Zod
- [x] Zod schema for the request `{ need, framework, dependencies? }` in `shared/`, replacing the
      `ReportRequest` interface with a type inferred from the schema; dependencies contain package
      names and declared version ranges; size limits keep costs predictable (need at most 500
      characters, at most 200 dependency entries)
- [x] Internal `findCandidates()` function (no endpoint): prompt uses need, framework, and optional dependency entries as context; returns search keywords and candidate package names
- [x] Combine with npm registry search results; resolve latest versions from the registry
- [x] Return at most 5 candidates, since each one adds data fetches and tokens to AI call 2

Tests: OpenRouter mocked; valid response parsed; invalid model output rejected with a clear error;
invalid request rejected by the Zod schema, including oversized input; no more than 5 candidates
returned.

Success criteria: a real call to `findCandidates()` with a sample need returns a sensible list of
at most 5 name@version candidates.

## Part 6: Fetch package data

- [x] Verify the remaining endpoints (npm downloads, deps.dev, OSV, GitHub) by calling each once
      by hand and adding the response shape to `docs/endpoints.md`
- [x] Fetch version-specific package metadata and README from npm, and security findings and activity data from deps.dev, OSV, npm downloads, and GitHub, on every request
- [x] Stars, open issues and Scorecard from deps.dev; one GitHub call per package for the last
      push and the archived flag (decided with the user). Stars moved to GitHub in Part 9
- [x] When npm's metadata has no README, fall back to the published `README.md` on jsDelivr
      (decided with the user; npm has none for `cron@4.4.0` although the package ships one)
- [x] Merge into one `PackageData` type, with source and fetch date per field (one group per
      source: every field in a group shares its source, URL and fetch date)
- [x] A failed source (GitHub rate limit, no repository, timeout) marks its fields as unavailable
      instead of failing the request; the report shows them as unavailable
- [x] GitHub token from `.env` (a fine-grained token with public repository read access; limit
      checked at 5,000 requests per hour)

Tests: each fetcher against recorded fixtures; merge logic; a failed source yields unavailable
fields.

Success criteria: data for a few real packages is fetched and merged.

## Part 7: AI call 2, comparison report

- [x] Prompt sends only fetched data and READMEs; asks for ranking, reasons, rejected alternatives
      and why, and security and compliance per package (license, known vulnerabilities,
      maintainers, dependency count, release activity). Data sources and fetch dates are added by
      code from `PackageData`, not by the model
- [x] Zod schema for the structured result; each factual claim, recommendation, and ranking includes evidence references identifying package, fetched field, source, and fetch date; keep wording close to those facts and avoid unsupported interpretations
- [x] Validate every evidence reference against the data fetched for the report; reject output containing references to fields that were not fetched. This validates reference existence, not semantic support, so report wording must remain close to the cited facts
- [x] `POST /api/report`, the only report endpoint: validates `{ need, framework, dependencies? }`
      with the Part 5 schema, then runs the whole pipeline (`findCandidates()`, fetch package data,
      comparison) and returns the report. Clients cannot pass their own candidate list.
- [x] No AI retries, so a request never exceeds two AI calls: invalid model output or an
      OpenRouter error returns 502 with a clear message
- [x] Per-IP rate limit on `POST /api/report` (`express-rate-limit`, for example 10 requests per
      hour) so the public endpoint cannot run up OpenRouter costs
- [x] The model cites only package and field (`npm.license`, `github.unavailable`); code fills in
      the source and fetch date from `PackageData`. READMEs are cut to 4,000 characters in the
      prompt
- [x] Real run for "A date picker component" (React): 3 ranked, 2 rejected, all evidence valid;
      about 6,700 prompt and 3,800 completion tokens for call 2, under $0.001 per report. One
      earlier run was rejected because the model cited a field that was not fetched

Tests: OpenRouter mocked; schema validation; invalid request body returns 400; one request makes
exactly two AI calls; invalid model output returns 502 with no retry; requests over the rate limit
return 429; each request generates a report without storing it.

Success criteria: a report is generated for a sample need and returned without being stored.

## Part 8: Connect frontend to backend

- [x] Replace the mock API with a single `POST /api/report` call via TanStack Query
- [x] Loading state; error states with a clear message for 400 (invalid input), 429 (rate limit)
      and 502 (AI failure)
- [x] Send need, framework, and only filtered public dependency names and declared version ranges from package.json, matching the preview; never send the manifest itself
- [x] Vite dev server proxies `/api` to the Express server on port 3000
- [x] Browser check on the built server: "A date picker component" (React) showed the loading
      state, then a real report with ranking, evidence, security and data sources
- [x] Log the raw model output when a report is rejected (console only, never stored), with every
      invalid reference listed
- [x] Comparison prompt lists words to avoid and gives good and bad claim examples; measured on 8
      real reports before and after (results in `AGENTS.md`, under the model choice)
- [ ] Investigate intermittent 502s: the model sometimes writes a literal `...` as a package name
      or field (`...`, `npm...`), 2 failures in 11 real runs (0 in 8 since the prompt change).
      Read the logged output of the next failure to find the cause. First logged failure
      (2026-10-27): the model wrote its reasoning text into the first package name and filled the
      rest with a template of `...` placeholders, after only 590 completion tokens; the cause of
      that output is not proven yet

Tests: integration tests with a mocked fetch layer, including each error status; the existing
mock-based tests still pass.

Success criteria: need + framework in the browser produces a real report end to end.

## Part 9: Report UI redesign

- [x] Two columns on wide screens: request form on the left, result on the right; stacked on
      narrow screens
- [x] The result column shows an empty state before the first request and the loading state in
      place while a report is generated
- [x] Ranked candidates as cards: rank, name and version (linked to npm), reasons, and key facts at
      a glance from the security summary (license, known vulnerabilities, maintainers, dependency
      count, release activity). Weekly downloads and a one-line summary are not in the report
      data, so they were left out rather than adding server fields
- [x] Evidence under each card, collapsed so the cards stay short; the separate security table is
      gone since its facts are now on each card
- [x] Rejected alternatives shown compactly with their reasons; facts and evidence collapsed
- [x] Clear visual hierarchy: the top recommendation stands out; status colors always keep a
      text label; data sources and fetch date at the bottom
- [x] Browser check with a real report ("A date picker component", React) on desktop and at 390px
      (in an iframe, since the browser window could not be resized): no horizontal scroll; the
      rank now keeps its own column so the name and badge wrap beside it

Fixes after review:

- [x] Source label rule: every fact and reason ends with its source in brackets (`(npm)`,
      `(OSV)`, `(deps.dev)`, `(GitHub)`). The label is a link only when it goes somewhere the card
      does not already link: `npm` and `GitHub` are plain text because the package name and the
      GitHub badge already link to those pages; `OSV` and `deps.dev` are links. Fact and reason
      sentences are plain text, no longer links to the first page their claim cites
- [x] Drop the collapsible Evidence section (ranked cards) and the evidence part of "Facts and
      evidence" (rejected cards, which becomes "Facts"): with source labels on every line it would
      only repeat the card. This removes the bulky text
      (`qrcode.react vulnerabilities.known, OSV, Oct 28, 2026`); the data sources footer keeps the
      fetch dates
- [x] Every fact's text is written by code from its fetched field, not by the model. The model only
      picks the status of license (`MIT`), dependency count (`6`) and release activity
      (`2026-06-09`), after a real report showed its fact text repeating the status
      (`Latest release 2026-06-09; status ok`). Code sets the vulnerabilities status; maintainers,
      weekly downloads and stars show a neutral row with no status label. A fact whose source
      failed shows `unavailable` with no status
- [x] Known vulnerabilities: a count from the fetched OSV data (`0 known (OSV)`, `4 known (OSV)`),
      status OK for none and Risk for any, so a raw array never appears. A real run ("A QR code
      component", React) did not reproduce the array: the model wrote "none known" for all five
      packages, so its source is not proven; code now writes this text either way
- [x] Maintainers from `npm.maintainers`: one maintainer shows the name (`zpao (npm)`), more than
      one shows the count (`2 (npm)`)
- [x] Weekly downloads from the fetched npm downloads (`1,234,567 (npm)`)
- [x] Stars from GitHub (`stargazers_count`, already in the GitHub repository response we fetch,
      so no extra call) instead of deps.dev, whose count is a snapshot that can lag
      (`12,345 (GitHub)`). Update `docs/endpoints.md` and the Part 6 note on where stars come from
- [x] Unavailable data: a fact whose source failed or does not exist shows `unavailable` with its
      source (`unavailable (OSV)`, `unavailable (GitHub)` when there is no repository), as Part 6
      requires
- [x] GitHub badge next to the package name on every card (ranked and rejected) when the package
      has a repository: a small secondary link (`GitHub`), so the package name stays the main
      link. The report has no repository URL today, so the server adds it from the fetched
      `PackageData` (code, not the model)
- [x] Data sources footer: one entry per source actually fetched for this report (`npm`, `OSV`,
      and `deps.dev`, `GitHub`, `jsDelivr` only when used), linking to the source's site, with
      the earliest fetch date of that source. Today it lists every source for every package
      (`npm registry for x@1.0.0`, `npm downloads for x@1.0.0`), so the same URL repeats
- [x] Seven facts lay out as 4 + 3 on wide cards (3 columns between 480px and 640px, 2 on
      phones), and a fact value never wraps, so a date no longer breaks at its hyphens
- [x] Replace reasons with pros and cons. A real report showed the reasons repeating the facts
      with the model's status words (`License ISC - ok`), adding nothing a card does not already
      show. Each pro and con is a cited claim like the reasons were, ending with its source labels
- [x] Pros and cons use only data that is not a fact row: fit from the README and description,
      peer dependencies, types, deprecation, size, and comparisons between candidates ("the most
      weekly downloads of the candidates"). The prompt says the facts are already shown and that
      status words never appear in the text
- [x] Summary on the rank 1 card: one or two sentences on why it suits the need best, every claim
      citing fields like any other, ideally compared with the runner-up. Shown above its facts
- [x] Schema minimums: a ranked package has at least one pro, a rejected one at least one con, and
      rank 1 has a summary; otherwise the answer is rejected like any incomplete answer
- [x] Layout: the summary ("Why <name>") sits above the ranking, outside the cards, since it
      compares rank 1 with rank 2; each ranked package shows facts, then pros and cons; rejected
      alternatives show their cons, with pros and facts collapsed
- [x] Each package card shows its npm description under the name, copied by code (no AI)
- [x] npm's README placeholder: for a package without a README, npm sends the text
      `ERROR: No README data found!` instead of an empty string. The model read it, cited `readme.unavailable`
      (not a fetched field) and 2 of 3 reports were rejected. The placeholder now counts as no README,
      so the jsDelivr fallback runs and the group is marked unavailable when that fails too
- [x] Measure on 3 real reports for the same need ("A QR code component", React): how many pros
      and cons repeat a fact row, carry a status word or a field path, against the old reasons.
      Old reasons (2 runs, 45 lines): 40 repeat a fact, 17 status words, 0 field paths. Pros and
      cons (3 runs, 56 lines): 28 flagged as repeating a fact (overcounted: any peer dependency
      line matches), 0 status words, 19 field paths, all in one run. Judgements remain ("actively
      released", "notably larger", "very low"), and runs ranked a different package first
- [x] Limits on the OpenRouter calls after broken answers ran for 848s (13,500 tokens of
      whitespace) and 551s (22,767 tokens): output capped at 8,000 tokens (a normal answer uses up
      to about 3,500, reasoning included), a 120 second timeout, and the provider that answered on
      the log line, to see whether broken answers come from one provider. Next 3 runs all
      succeeded, on 3 providers: Crusoe 5.1s, DekaLLM 44.0s, Near AI 73.5s
- [x] A ranked package can now get a con from a fact rated warning or danger (or known
      vulnerabilities), after the recommended package showed Risk for release activity with no
      cons. In 3 runs, rank 1 got "No releases in the last year" whenever it had that status
- [x] Browser check with a real report on desktop and at 390px (in an iframe, since the window
      could not be resized); the layout passed before pros and cons. Run on 2026-10-29 (QR code
      need, React), two real reports, 21s and 24s: summary above the cards, npm descriptions,
      facts in 4 columns on desktop and 2 at 390px, no horizontal scroll. Both
      ranked `qrcode.react` first with release activity Caution and no con, so the con rule from
      the earlier item held in 3 runs but not in these 2. The user approved the look

Tests: component tests for the empty, loading, error and report states; existing report
rendering tests updated to the new layout. Source labels show only the source name; `npm` and
`GitHub` are never links, `OSV` and `deps.dev` are; fact and reason sentences are not links; no
Evidence section; vulnerabilities show `0 known (OSV)` with OK and a count with Risk;
maintainers show the name for one and the count for several; weekly downloads and stars show the
formatted number with no status; a failed or missing source shows `unavailable` with its source;
the GitHub badge links to the repository and is absent when there is none; the data sources
footer lists each fetched source once. Pros and cons render under their headings with source
labels; the summary shows once, above the cards; rejected alternatives show cons with pros and facts
collapsed; an answer without a summary, a ranked package without a pro or a rejected one without
a con is rejected.

Success criteria: the user approves the look in the browser; the top recommendation and why it
was chosen are clear without scrolling through the whole report; no field path or raw array is
visible in the report.

## Part 10: Server logging

- [x] One short log line per pipeline step of `POST /api/report`: request received (framework,
      dependency count), AI call 1 done (candidates, duration, tokens), data fetched (failed
      sources only), AI call 2 done (duration, tokens, cost), response sent (status, total
      duration). The candidate count is on the data fetched line, which also says "none" when
      no source failed
- [x] A request ID on every line so the lines of one request can be followed together
- [x] Never log the need text or dependency names; the raw model output on rejection stays as
      it is (console only)
- [x] Errors log the step that failed and the reason in one line, not a stack trace for expected
      failures (rate limit, invalid input, rejected model output)
- [x] Real run in the terminal ("A date picker component", React): five lines, 54.6s in total,
      49.9s of it in AI call 2; an earlier run showed the failure line and the raw model output

Tests: a successful request logs each step once with the same request ID; a failed step logs
the step name and reason; the need text never appears in the log output.

Success criteria: a real report in the terminal shows about six readable lines that tell what
happened and how long each step took.

## Part 11: Analytics

- [x] Choose with the user between a privacy-friendly hosted tool (for example Plausible, Umami
      or Cloudflare Web Analytics) and server-side counts, depending on the host chosen. Chosen:
      server-side counts in Neon Postgres (free plan, wakes by itself after idle), one project
      with a `main` branch for production and a `dev` branch for local runs
- [x] Track without login: visits, reports requested, framework, success or error status, date
      and time, and country (from the IP, which is not stored)
- [x] Unique visitors per day and reports per visitor per day, from a hash of the IP with a random
      salt that is replaced daily and never stored (no tracking across days)
- [x] Track usage per report: tokens and cost of both AI calls, to see how much it costs
- [x] Never record the need text, dependency names or the report itself
- [x] Update the privacy constraints in `AGENTS.md` to say exactly what is collected
- [x] Say in the README and in the app what is collected
- [x] No cookies and no stored IP addresses, so no consent banner is needed
- [x] Real run on the dev branch: one visit, one real report (200, 6,837 + 3,164 tokens,
      $0.00112) and one invalid request (400) recorded as three rows; country is null on
      localhost and needs `trust proxy` behind the host (Part 13)

Tests: the tracking call carries only the allowed fields; no tracking call contains the need or
dependencies.

Success criteria: after a few real reports the user can see who used it (country), when, how
often and at what cost, and the collected fields match the privacy section.
