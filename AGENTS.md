## Business Requirements

**User flow**
This project is a tool that helps developers pick the right npm package for their needs.
Users, use cases and the storage decisions are in `docs/product.md`.

The form flow below is the same with or without an account. It has no chat and no follow-up
turns: each request makes a fixed, small number of AI calls to keep costs predictable. Signed-in
users (GitHub) also get private saved reports, history, refresh, share links, a chat that refines
or creates reports, and an MCP server. Chat and MCP are for signed-in users only, and each has a
step limit and a cost cap enforced in code.

1. The user describes the need and picks a framework.
2. AI call 1, query expansion: the need and framework become npm search keywords and candidate package names. If the user provides package.json, include its filtered public dependency names and declared version ranges as context.
3. The server fetches public data for the candidates on each request.
4. AI call 2, comparison and report: a grounded comparison of the candidates. Reports are generated per request.
5. Done. The result is shown and can be exported. The user can create a share link with a button
   (rules in `docs/product.md`).

**Report contents**

- Ranked candidates with pros and cons for each position, and a summary of why the top one was
  chosen
- Alternatives considered and why they were rejected
- Security and compliance: license, known vulnerabilities, maintainers, dependency count, release activity
- Data sources and the date the data was fetched

## Limitations

**Out of scope**

- Teams and package policy (platform plan, Later)
- Pull request check and vulnerability watch (agents plan, Later)
- Auditing a package that is already installed
- Languages other than JavaScript and TypeScript
- Charts of trends over time

**Privacy constraints**

- The tool must work fully without a file: need + framework is enough for a result.
- package.json is optional and is parsed and filtered in the browser only. The server receives the need, framework, and filtered public dependency names and declared version ranges; never the raw file, scoped packages outside the allowlist, or non-registry entries. Rules in `client/AGENTS.md`.
- Reports are stored only as decided in `docs/product.md`, and deleted after a configurable
  retention period: anonymous reports 10 days, or 30 days once the user creates a share link;
  signed-in reports 100 days from the latest version, private, with an optional share link the owner can revoke. Deleting
  an account deletes all its data.
  Package data is not cached.
- Anonymous activity analytics: visits, report count, framework, success or error status,
  time, country, and AI tokens and cost per report. Unique visitors are counted per day with a
  hash of the IP and a random salt that is replaced daily and never stored, so visitors cannot be
  identified or followed across days. No IP addresses stored, and never the need text, dependency
  names or the report. The `events` table is never linked to users or reports; per-user numbers
  come from the account tables.
- The only cookie is the session cookie set after signing in.
- Permissions, limits and data rules are enforced in code, never by the model.
- New features stay behind feature flags until turned on; `docs/plan-platform.md` and
  `docs/plan-agents.md` record which flags are on.
- The whole project is open source, so anyone can verify these privacy claims.

**AI constraints**

- The AI only explains and ranks fetched data. Every factual claim, recommendation, and ranking must cite one or more fetched data fields. Keep report wording close to the cited facts and avoid broader interpretations that the data does not directly establish (for example, state the last release date instead of calling a package "actively maintained"). Each evidence reference identifies the package, field, source, and fetch date. The server validates that each reference points to a field fetched for that report; this check does not independently prove that the field supports the wording.

## Technical Decisions

| Layer       | Choice                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| Client      | React, TypeScript, Vite, TanStack Query                                               |
| Server      | Node, Express, TypeScript, Zod                                                        |
| AI          | OpenRouter API (`openai/gpt-6-luna`) with structured JSON output                      |
| Analytics   | Neon Postgres (free plan), one `events` table; country from a bundled GeoLite2 lookup |
| Tests       | Vitest, React Testing Library, Supertest                                              |
| Repo and CI | pnpm workspaces monorepo (`client/`, `server/`, `shared/`), GitHub Actions            |
| Hosting     | Google Cloud Run (one instance); the server serves the built client                   |

**Model: `openai/gpt-6-luna`**, chosen on 2026-10-29 from a comparison of 3 sample needs run 3
times each (`docs/plan-mvp.md`, Part 12):

- Typical report: 26 to 39 seconds (32s average), about $0.0023 ($0.10 / $0.50 per million input
  / output tokens). Default OpenRouter routing; every run went to OpenAI, and the other providers
  list the same price, so no provider setting is needed.
- 0 of 9 runs failed, rank 1 was the same in all 3 runs of each need, and no claim contained a
  field path, a status word or a judgement the data does not show.
- Con: the same fact sometimes gets a different status between runs (6 facts across 9 runs).
- Rejected: `openai/gpt-oss-120b` ($0.0012 but 18 to 107 seconds depending on the provider
  OpenRouter picks, a timeout, field paths in 16% of claims; sorting providers by throughput did
  not make it steady) and `anthropic/claude-haiku-5.5` (fewest status changes, 22 to 28 seconds,
  but $0.0039 per report).

- `client/`: form, local package.json filtering, preview, report view, export. See `client/AGENTS.md`.
- `server/`: single `POST /api/report` endpoint, data fetching, AI calls. See `server/AGENTS.md`.
- `shared/`: request and report types used by both.

Before working on files in `client/` or `server/`, read that folder's `AGENTS.md`.

## Current state

Read `docs/plan-platform.md` for the current state, then `docs/plan-agents.md`, which starts after
it. The MVP and its measurements are in `docs/plan-mvp.md`. Each plan is executed one part at a
time.

## Workflow

- `docs/plan-platform.md`, then `docs/plan-agents.md`, are the backlog. Take only the next
  unchecked part.
- OpenSpec turns that part into a change in `openspec/` (`openspec-propose`), implements it
  (`openspec-apply-change`) and archives it (`openspec-archive-change`). When archived, check
  off the part's substeps in its plan file.
- Superpowers is for execution discipline only: `test-driven-development`,
  `systematic-debugging`, `verification-before-completion` and the code-review skills.
- Do not use `superpowers:brainstorming`, `writing-plans`, `executing-plans` or
  `subagent-driven-development`; the plan files and OpenSpec replace them.
- No regressions: existing functionality keeps working after every part. All existing tests and
  the smoke test (`pnpm e2e`) pass in CI, and the "Smoke live" workflow passes against the live
  URL after each deploy and before turning a flag on. A test changes only when the behavior
  change is intended, and the commit says why.
- Feature flags: a new feature stays hidden behind a flag (`FEATURE_<NAME>`, off in production)
  until it gives the user value on its own. Turning a flag on is the user's decision, recorded in
  the plan file with the date; the flag is removed in a later small change once the feature is
  on and working.

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today.
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever.
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

**Project specifics**

- TypeScript everywhere, with a shared strict TypeScript config.
- ESLint and Prettier.
- CI runs lint and tests on GitHub Actions.
