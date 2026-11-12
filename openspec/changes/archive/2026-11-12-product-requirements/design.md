# Design

## Context

See proposal.md for why. Two facts shape the goals:

- The `events` table records report count, status, framework, tokens and cost, but not how long a
  report took (`at` is a timestamp only). Report time is measured by the eval suite (agents plan,
  Part 1) and the traces (platform plan, Part 7).
- `events` must stay anonymous and unlinked to users or reports, so per-user and per-report goals
  are measured from the account tables (`reports`, `report_versions`, `ai_usage`) once they
  exist.

## Goals / Non-Goals

**Goals:**

- Every use case has a goal with a number and a named data source that already exists or is
  built by a planned part.
- `AGENTS.md` states the rules for the target product, so later parts do not reopen them.

**Non-Goals:**

- No new metric, event or table only to measure a goal. A goal that the planned data cannot
  measure is changed, not given new tracking.
- No change to the README or the in-app privacy note (Part 5).

## Decisions

**Use cases and goals in `docs/product.md`.** Draft, for the user to approve or change:

| Use case                                                    | Goal                                                                                       | Measured from                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1. Pick a package for a need, with no account               | Median time to a report under 40 s; at least 95% of report requests succeed                | Eval suite and traces (time); `events` status |
| 2. Share a decision with a teammate or reviewer             | At least 1 in 5 signed-in reports gets a share link                                        | `reports.share_id`                            |
| 3. Come back to a past decision and check it is still valid | At least 1 in 4 signed-in reports reaches version 2 (refresh or chat) instead of a new run | `report_versions.source`                      |
| 4. Refine a report in a conversation                        | Every chat version passes the grounding check; median cost per turn under the per-turn cap | `report_versions`, `ai_usage`                 |
| 5. Get a report from the editor (MCP)                       | A report created through MCP matches the eval quality checks of the form pipeline          | Eval suite, `ai_usage.source`                 |

Use case 1 is the MVP and stays the anonymous default. Cost limits are constraints, not use
cases: they live in `AGENTS.md` and in Part 4, not in this table.

Alternative considered: goals based on how often reports or share links are opened. Rejected
because nothing in the plans records opens, and adding that tracking just to measure it goes
against the privacy rules.

**Plan mapping.** One table in `docs/product.md` from each part of both plans to its use case.
Parts that serve no single use case (regression check and flags, Drizzle, observability, eval
suite, failure drill, README) are mapped to "all: keeps the product working and measurable".

**How `AGENTS.md` describes features behind flags.** It states the target rules (storage, links,
chat) with one line saying that features stay behind feature flags until turned on, and that
`docs/plan-platform.md` records which flags are on. Alternative: keep the MVP rules until each
flag is turned on. Rejected because every part from 2 on builds against the new rules, and the
plan's success criterion for this part is approving the updated `AGENTS.md`.

**Privacy rules carried into `AGENTS.md`.**

- Stays: package.json filtered in the browser; anonymous `events` with daily salted hash; the AI
  only explains fetched data; the open source claim.
- Changes: "no storage" becomes the retention rules of `docs/product.md`; "no cookies" becomes
  "no cookies except a session cookie after sign-in"; "no chat" applies to the anonymous form
  only.
- Added: `events` is never linked to users or reports; permissions, limits and data rules are
  enforced in code, never by the model; deleting an account deletes all its data.

## Risks / Trade-offs

- [The goal numbers are guesses before any account data exists] → They are marked as starting
  targets in `docs/product.md` and revised from the usage page (Part 7).
- [`AGENTS.md` describes storage the live site does not do yet] → The flag line in
  `AGENTS.md`, and the README and privacy note stay unchanged until Part 5.
