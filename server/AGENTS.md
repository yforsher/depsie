# Server

Node, Express, TypeScript, Zod for input validation. Tests with Vitest and Supertest.

The server is the only place that holds API keys (`OPENROUTER_API_KEY`, `GITHUB_TOKEN` in `.env`,
never in the repo) and talks to outside services.

## Endpoints

- `GET /api/health` returns `{ status: "ok" }`.
- `POST /api/report` is the only report endpoint. It validates `{ need, framework, dependencies? }`
  with Zod (with input size limits), then runs the whole pipeline and returns the report. There is
  no endpoint per stage, so clients cannot trigger AI call 2 with their own candidate list.
- `POST /api/report` has a per-IP rate limit to keep costs predictable.
- In production, Express also serves the built client (`client/dist`) with SPA fallback.

## AI usage

OpenRouter with structured JSON output, validated with Zod. Model: `openai/gpt-oss-120b`. At most
two AI calls per request and no retries: invalid model output or an OpenRouter error returns 502
with a clear message.

1. Query expansion: turn the need and framework into npm search keywords and candidate names. When
   provided, include the filtered public dependency names and declared version ranges as context.
2. Grounded comparison: send only fetched public package data and READMEs. Ask for ranking,
   reasons, rejected alternatives, and security and compliance per package. Data sources and fetch
   dates are added in code from the fetched data, not by the model.

Every evidence reference in the model output must point to a field fetched for that report;
output with any other reference is rejected.

## Data sources

Endpoints were written from memory and must be verified before use (Parts 5 and 6 of `docs/plan.md`).

| Source                                                 | Used for                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| npm registry search (`registry.npmjs.org/-/v1/search`) | Finding candidates by keyword                                                               |
| npm registry package metadata                          | Versions, release dates, license, maintainers, dependencies, peer dependencies, types, size |
| npm downloads API (`api.npmjs.org/downloads`)          | Weekly downloads                                                                            |
| deps.dev API (Google Open Source Insights)             | Licenses, advisories, dependency graph, OpenSSF Scorecard                                   |
| OSV.dev API                                            | Known vulnerabilities per version                                                           |
| GitHub REST API (token needed for higher rate limits)  | Stars, open issues, last commit                                                             |

A failed source (for example a GitHub rate limit) marks its fields as unavailable instead of
failing the request.

## Storage

- All package data is fetched on every request; nothing is cached.
- User input and reports are never stored.

## Code structure

- `src/app.ts`: `createApp()` builds the Express app without listening, so tests need no port.
  It takes the client build directory and serves it with SPA fallback; unknown `/api/` paths
  return 404.
- `src/index.ts`: entry point; listens on `PORT` (default 3000) and serves `client/dist`.
- `.env` is loaded from the repo root with Node's `--env-file-if-exists` flag (see `package.json`
  scripts); it is optional.
- Tests sit next to the code as `*.test.ts` and use Supertest against `createApp()`.
