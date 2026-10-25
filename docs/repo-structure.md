# Repository structure

The repo holds a React client and an Express server that share request and report types. Two
layouts were considered.

## Option 1: one package

One `package.json` at the root, with `src/client`, `src/server` and `src/shared` folders. Shared
code is imported with relative paths.

Pros:

- Simplest setup: one `package.json`, one lockfile, works with plain npm.
- No linking or build step for shared code.
- One install and one set of scripts.

Cons:

- One mixed dependency list. Nothing stops client code from importing a server-only package, or
  the reverse.
- Still needs separate tsconfig files for DOM and Node types.
- Harder to build, test or deploy one side on its own.
- The client/server boundary is only a convention.

## Option 2: separate packages (chosen)

A workspace with `client/`, `server/` and `shared/`, each with its own `package.json`.

Pros:

- Each package declares only what it uses, and the package manager enforces it.
- Each side builds and tests on its own (`pnpm --filter server test`).
- The client and server can only share what `shared` exports.
- Can later move to separate hosts without restructuring.

Cons:

- More configuration: a `package.json` and tsconfig per package, plus `pnpm-workspace.yaml`.
- Needs a package manager with workspace support.

## Why option 2

The app is deployed to one host: the server serves the built client from `client/dist`. That alone
would favor option 1, but two reasons outweigh it:

- **Privacy claim.** The raw `package.json` is parsed only in the browser and never reaches the
  server. Separate packages make that boundary easy to verify: what the client sends and what the
  server accepts are both defined by types in `shared`.
- **Separate dependencies.** Browser code cannot import server-only packages such as API
  clients, and server code cannot import React.

## Why pnpm

- **Workspaces.** `pnpm-workspace.yaml`, `workspace:*` links between local packages and
  `--filter` for running commands in one package.
- **Strict `node_modules`.** Code can only import packages it declares, so phantom dependencies
  fail immediately instead of breaking later.
- **Speed and disk space.** One global store with hard links, so installs are fast locally and in
  CI.
- **Supply-chain safety.** Dependency install scripts do not run by default.

npm would be enough for a single-package project. For a workspace, pnpm is the stricter and better
supported choice.

## Package files

| File                  | Role                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `package.json` (root) | Lint and format tools, and scripts that run every package's script |
| `client/package.json` | Client dependencies (React, Vite) and scripts                      |
| `server/package.json` | Server dependencies (Express) and scripts                          |
| `shared/package.json` | Makes `shared` importable by the client and server                 |

`pnpm install` at the root installs all three packages.

## Scripts

All commands run from the root. Most root scripts delegate to the packages.

| Command                      | What runs                                                               |
| ---------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                   | Client (Vite) and server (`tsx watch`) in parallel                      |
| `pnpm build`                 | Client to `client/dist`, server to `server/dist`                        |
| `pnpm --filter server start` | Built server on port 3000, which also serves `client/dist` (production) |
| `pnpm test`                  | Vitest in client and server                                             |
| `pnpm lint`                  | ESLint and Prettier over the whole repo (a root script)                 |

Use `--filter` to run one package, for example `pnpm --filter client test`.

## Tests

`pnpm test` runs automated tests only, with no real network or AI calls.

- **Server:** API tests with Supertest against the in-memory Express app: health endpoint,
  serving the built client, 404 for unknown API routes.
- **Client unit:** `package.json` parsing and privacy filtering (scope allowlist, non-registry
  entries).
- **Client components:** React Testing Library tests of the request form and report view.
- **Client integration:** form submit to rendered report, using the mock API.

There are no end-to-end tests against the real server.
