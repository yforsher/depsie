# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Finished parts move to `plan-done.md` (Parts 1 to 13 so far), with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

## Part 14: Random need examples and more frameworks

The need field always shows the same placeholder. Show a different example on each page load, so
users see the range of needs the tool handles, from a short one to several requirements.

The framework list also misses cases where the framework changes which package is right, and
"None" can read as "not specified".

- [x] Add `client/src/needExamples.json`, a plain array of 40 examples, next to
      `allowlist.json`
- [x] In `RequestForm`, pick one at random with a lazy `useState` initializer, so it is chosen once
      per page load and does not change while the user types
- [x] Check the examples in the browser at the narrowest form width. At 320px, 16 of them did not
      fit 3 rows, so the need field now has 4 rows and the texts stay as they are
- [x] Add the file to the code structure in `client/AGENTS.md`
- [x] In `shared/src/index.ts`, add `Next.js`, `React Native`, `Nuxt`, `Solid`, `Express`, `Fastify`
      and `NestJS` to `frameworks`, and rename `None` to `No framework`. Old analytics rows keep
      `None`, so queries on that value count both
- [x] Add `@nuxtjs`, `@react-native-community`, `@solid-primitives` and `@solidjs` to
      `client/src/allowlist.json`, so these public scopes are sent from package.json

Tests: with `Math.random` mocked, the need field shows the first and the last example; the
placeholder stays the same after typing; the file has 40 unique entries, each within
`maxNeedLength`; the request schema accepts the new framework names and rejects `None`; a package
in each new scope is in `sent`.

Success criteria: reloading the page shows different examples, the text does not change while
typing, the dropdown shows the new frameworks and `No framework`, a report succeeds with one of the
new frameworks, and all tests pass.

## Part 15: Share report as Markdown download

- [ ] Build Markdown from the structured report in code (no AI call)
- [ ] Download button saves a `.md` file

Tests: Markdown builder snapshot; contains all report sections and the data fetch date.

Success criteria: the downloaded file reads correctly and matches the on-screen report.

## TBD

- Package data cache: dropped for now, since resolving the latest version already fetches the
  metadata and README, AI calls dominate cost and latency, and free hosts often wipe the disk.
  Revisit with an in-memory cache only if npm latency or limits become a problem.
