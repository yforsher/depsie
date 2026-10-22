# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Part numbers were renumbered (the original list had two Part 7s and two Part 8s).
- `client/AGENTS.md` and `server/AGENTS.md` already exist; fill in their code structure as each part is built.

## Part 1: Plan

- [x] Enrich this document with substeps, tests and success criteria per part
- [x] User reviews and approves the plan

Success criteria: the user approves this document.

## Part 2: Scaffolding

- [x] `git init`
- [x] `.gitignore` (node_modules, dist, .env, \*.sqlite)
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

## Part 5: Database modeling

- [ ] Propose a SQLite schema for the cache and get user approval before coding:
  - `package_version` (name, version, version-specific npm metadata and README, fetched_at): cached by name and version
  - Security findings and activity data (downloads, stars, issues, and recent commits) are fetched on every request and are not cached
  - Reports are generated per request and are not stored or cached
- [ ] Implement with `better-sqlite3` (or `node:sqlite` if stable in the Node version used)
- [ ] Small package cache module: `get`, `set` by package name and version

Tests: package name/version set/get roundtrip; a miss returns nothing; different versions of the
same package are stored separately.

Success criteria: user approves the schema; cache tests pass using an in-memory database.

## Part 6: AI call 1, query expansion

- [ ] Verify every endpoint in AGENTS.md (npm search, metadata, downloads, deps.dev, OSV, GitHub,
      OpenRouter) by calling it once by hand and recording the response shape in `docs/endpoints.md`
- [ ] Choose the OpenRouter model with the user; confirm it supports structured JSON output
- [ ] OpenRouter client using structured JSON output; validate the response with Zod
- [ ] Zod schema for the request `{ need, framework, dependencies? }`, where dependencies contain
      package names and declared version ranges; size limits keep costs predictable (need at most
      500 characters, at most 200 dependency entries)
- [ ] Internal `findCandidates()` function (no endpoint): prompt uses need, framework, and optional dependency entries as context; returns search keywords and candidate package names
- [ ] Combine with npm registry search results; resolve latest versions from the registry

Tests: OpenRouter mocked; valid response parsed; invalid model output rejected with a clear error;
invalid request rejected by the Zod schema, including oversized input.

Success criteria: a real call to `findCandidates()` with a sample need returns a sensible list of
name@version candidates.

## Part 7: Fetch package data

- [ ] Fetch version-specific package metadata and README from npm; fetch security findings and activity data from deps.dev, OSV, npm downloads, and GitHub on every request without caching them
- [ ] Merge into one `PackageData` type, with source and fetch date per field
- [ ] A failed source (GitHub rate limit, no repository, timeout) marks its fields as unavailable
      instead of failing the request; the report shows them as unavailable
- [ ] Read package metadata and README through the name/version cache from Part 5; fetch security findings and activity data on each request without caching
- [ ] GitHub token from `.env`

Tests: each fetcher against recorded fixtures; merge logic; a failed source yields unavailable
fields; cached package metadata and README skip their npm fetches; security and activity fetchers
run on each request.

Success criteria: data for a few real packages is fetched and merged; package metadata and README are cached by name/version, while security and activity data are fetched again on each request and are not cached.

## Part 8: AI call 2, comparison report

- [ ] Prompt sends only fetched data and READMEs; asks for ranking, reasons, rejected alternatives
      and why, and security and compliance per package (license, known vulnerabilities,
      maintainers, dependency count, release activity). Data sources and fetch dates are added by
      code from `PackageData`, not by the model
- [ ] Zod schema for the structured result; each factual claim, recommendation, and ranking includes evidence references identifying package, fetched field, source, and fetch date; keep wording close to those facts and avoid unsupported interpretations
- [ ] Validate every evidence reference against the data fetched for the report; reject output containing references to fields that were not fetched. This validates reference existence, not semantic support, so report wording must remain close to the cited facts
- [ ] `POST /api/report`, the only report endpoint: validates `{ need, framework, dependencies? }`
      with the Part 6 schema, then runs the whole pipeline (`findCandidates()`, fetch package data,
      comparison) and returns the report. Clients cannot pass their own candidate list.
- [ ] No AI retries, so a request never exceeds two AI calls: invalid model output or an
      OpenRouter error returns 502 with a clear message
- [ ] Per-IP rate limit on `POST /api/report` (`express-rate-limit`, for example 10 requests per
      hour) so the public endpoint cannot run up OpenRouter costs

Tests: OpenRouter mocked; schema validation; invalid request body returns 400; one request makes
exactly two AI calls; invalid model output returns 502 with no retry; requests over the rate limit
return 429; each request generates a report without storing it.

Success criteria: a report is generated for a sample need and returned without being stored or cached.

## Part 9: Connect frontend to backend

- [ ] Replace the mock API with a single `POST /api/report` call via TanStack Query
- [ ] Loading state; error states with a clear message for 400 (invalid input), 429 (rate limit)
      and 502 (AI failure)
- [ ] Send need, framework, and only filtered public dependency names and declared version ranges from package.json, matching the preview; never send the manifest itself

Tests: integration tests with a mocked fetch layer, including each error status; the existing
mock-based tests still pass.

Success criteria: need + framework in the browser produces a real report end to end.

## Part 10: Share report as Markdown download

- [ ] Build Markdown from the structured report in code (no AI call)
- [ ] Download button saves a `.md` file

Tests: Markdown builder snapshot; contains all report sections and the data fetch date.

Success criteria: the downloaded file reads correctly and matches the on-screen report.
