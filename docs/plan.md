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
      push and the archived flag (decided with the user)
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
      Read the logged output of the next failure to find the cause

Tests: integration tests with a mocked fetch layer, including each error status; the existing
mock-based tests still pass.

Success criteria: need + framework in the browser produces a real report end to end.

## Part 9: Share report as Markdown download

- [ ] Build Markdown from the structured report in code (no AI call)
- [ ] Download button saves a `.md` file

Tests: Markdown builder snapshot; contains all report sections and the data fetch date.

Success criteria: the downloaded file reads correctly and matches the on-screen report.

## TBD

- Package data cache: dropped for now, since resolving the latest version already fetches the
  metadata and README, AI calls dominate cost and latency, and free hosts often wipe the disk.
  Revisit with an in-memory cache only if npm latency or limits become a problem.
- Model upgrade: start with `openai/gpt-oss-120b`. If reports are often rejected or their wording
  strays from the cited facts, compare against a more capable model (for example Claude Sonnet 5.5
  or GPT-6.1 Sol) on the same sample needs.
