# Project brief

Planning details moved out of AGENTS.md. Read when working on project setup, milestone scope, or open decisions.

## Getting started checklist

- [ ] Pick the final project name and create a public GitHub repo
- [ ] Set up the monorepo: pnpm workspaces with `client/` and `server/`, shared TypeScript config, ESLint and Prettier
- [ ] Create the client with Vite (React + TypeScript template)
- [ ] Create the server with Express and TypeScript, one health endpoint
- [ ] Add Vitest to both, and a GitHub Actions workflow for lint and tests
- [ ] Deploy client and server to free hosting and put the live URL in the README
- [ ] Get an OpenRouter API key and a GitHub token; keep them in `.env`, never in the repo
- [ ] Call the npm registry and OSV APIs by hand once to confirm the response shapes
- [ ] Write the README intro: the problem, the idea, a screenshot placeholder

## Milestones

Each ends with something working and deployed.

1. Skeleton: monorepo with client and server, a single endpoint returning data for one package, deployed with a public URL, CI running lint and tests.
2. Package data: server fetches and merges npm, downloads, deps.dev and OSV data for a package. Client shows a package card.
3. Search and compare: need + framework produces a shortlist; comparison table with live filters.
4. Project fit: paste or drop package.json, in-browser parsing, preview of what is sent, scoped package filter, fit checks.
5. AI layer: query expansion, grounded ranking with structured output, side-by-side code examples.
6. Decision report: report view and Markdown export.
7. Polish: README with screenshots and a short demo GIF, tests for the core logic, accessibility pass.
8. Next (optional): MCP server that returns the same report.

## Open questions

- Final project name
- Hosting choice for client and server
- Monthly budget for OpenRouter API calls on the public demo (rate limit per visitor?)
- Which framework to use for the first demo examples (Vue 3 or React)
