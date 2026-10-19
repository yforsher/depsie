## Business Requirements

**User flow**
This project is a tool that helps developers pick the right npm package for their needs.
No chat and no follow-up turns: each request makes a fixed, small number of AI calls to keep costs predictable.

1. The user describes the need and picks a framework.
2. AI call 1, query expansion: the need and framework become npm search keywords and candidate package names. If the user provides package.json, include its filtered public dependency names and declared version ranges as context.
3. The server fetches public data for the candidates. Version-specific package metadata and READMEs are cached; security and activity data are fetched for each request.
4. AI call 2, comparison and report: a grounded comparison of the candidates. Reports are generated per request and are not cached.
5. Done. The result is shown and can be exported.

**Report contents**

- Ranked candidates with the reasons for each position
- Alternatives considered and why they were rejected
- Security and compliance: license, known vulnerabilities, maintainers, dependency count, release activity
- Data sources and the date the data was fetched

## Limitations

**Out of MVP scope**

- User accounts and saved history
- MCP server version (possible later milestone)
- Auditing a package that is already installed
- Languages other than JavaScript and TypeScript
- Charts of trends over time

**Privacy constraints**

- The tool must work fully without a file: need + framework is enough for a result.
- package.json is optional and is parsed and filtered in the browser only. The server receives the need, framework, and filtered public dependency names and declared version ranges; never the raw file, scoped packages outside the allowlist, or non-registry entries. Rules in `client/AGENTS.md`.
- No storage of user input or generated reports on the server, and no shareable reports. Only public, version-specific package metadata and READMEs are cached.
- The whole project is open source, so anyone can verify these privacy claims.

**AI constraints**

- The AI only explains and ranks fetched data. Every factual claim, recommendation, and ranking must cite one or more fetched data fields. Keep report wording close to the cited facts and avoid broader interpretations that the data does not directly establish (for example, state the last release date instead of calling a package "actively maintained"). Each evidence reference identifies the package, field, source, and fetch date. The server validates that each reference points to a field fetched for that report; this check does not independently prove that the field supports the wording.

## Technical Decisions

| Layer       | Choice                                                                             |
| ----------- | ---------------------------------------------------------------------------------- |
| Client      | React, TypeScript, Vite, TanStack Query                                            |
| Server      | Node, Express, TypeScript, Zod                                                     |
| AI          | OpenRouter API (model to be chosen) with structured JSON output                    |
| Cache       | SQLite, package metadata and README by name and version                            |
| Tests       | Vitest, React Testing Library, Supertest                                           |
| Repo and CI | pnpm workspaces monorepo (`client/`, `server/`, `shared/`), GitHub Actions         |
| Hosting     | Free tier hosting for client and server, to be decided                             |

- `client/`: form, local package.json filtering, preview, report view, export. See `client/AGENTS.md`.
- `server/`: single `POST /api/report` endpoint, data fetching, caching, AI calls. See `server/AGENTS.md`.
- `shared/`: request and report types used by both.

Before working on files in `client/` or `server/`, read that folder's `AGENTS.md`.

## Current state

Read `docs/plan.md` for the current state. The plan is executed one part at a time.

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today.
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever.
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

**Project specifics**

- TypeScript everywhere, with a shared strict TypeScript config.
- ESLint and Prettier.
- CI runs lint and tests on GitHub Actions.
