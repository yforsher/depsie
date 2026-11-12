# Tasks

## 1. Product document

- [x] 1.1 Write `docs/product.md` with who uses Depsie and the five use cases with their goals and measurement sources from design.md; verify every goal has a number and a data source named in the plans
- [x] 1.2 Add the storage and sharing decisions to `docs/product.md` (anonymous link, 30 days, delete from the link, read-only; signed-in private, revocable share link; no teams or package policy, see Later); verify each matches the wording in `docs/plan-platform.md` Part 1
- [x] 1.3 Add the table that maps each part of `docs/plan-platform.md` and `docs/plan-agents.md` to its use case; verify every part of both plans appears once

## 2. AGENTS.md

- [x] 2.1 Update Business Requirements: the anonymous form flow with fixed AI calls stays, and signed-in users get saved reports, history, refresh, chat and MCP, with a link to `docs/product.md`; verify the user flow and report contents sections still describe the anonymous form correctly
- [x] 2.2 Update the out-of-scope list: remove accounts, saved history and MCP; add teams, package policy, the pull request check and vulnerability watch (Later); verify it matches the Later sections of both plans
- [x] 2.3 Update the privacy constraints as listed in design.md (stays, changes, added) and add the feature flag line; verify the package.json rules are unchanged and no MVP "no storage" or "no cookies" wording remains
- [x] 2.4 Run `pnpm exec prettier --check AGENTS.md docs/product.md` and fix any formatting it reports

## Workflow follow-up

- The user approves `docs/product.md` and the updated `AGENTS.md` (Part 1 success criterion).
- Archive the change, then check off Part 1 in `docs/plan-platform.md`.
