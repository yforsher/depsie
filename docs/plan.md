# Project plan

Each part is executed one at a time. The agent checks off substeps as they are done and does not
start the next part until the current part's success criteria pass and the user approves.

Notes:

- Finished parts move to `plan-done.md` (Parts 1 to 13 so far), with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

## Part 14: Share report as Markdown download

- [ ] Build Markdown from the structured report in code (no AI call)
- [ ] Download button saves a `.md` file

Tests: Markdown builder snapshot; contains all report sections and the data fetch date.

Success criteria: the downloaded file reads correctly and matches the on-screen report.

## TBD

- Package data cache: dropped for now, since resolving the latest version already fetches the
  metadata and README, AI calls dominate cost and latency, and free hosts often wipe the disk.
  Revisit with an in-memory cache only if npm latency or limits become a problem.
