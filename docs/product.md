# Product requirements

## Who uses Depsie

A JavaScript or TypeScript developer choosing an npm package for a need in their project.

- Anonymous: no account. Fills in the form, gets a report with a link, and leaves.
- Signed in (GitHub): the same form, plus private saved reports, history, refresh, share links,
  chat and MCP.

## Use cases and goals

The goals are starting targets, revised from the usage page (platform plan, Part 7) once there is
real data. Each one is measured from data the plans already build; no tracking is added only to
measure a goal.

| Use case                                                    | Goal                                                                                       | Measured from                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1. Pick a package for a need, with no account               | Median time to a report under 40 s; at least 95% of report requests succeed                | Eval suite and traces (time); `events` (status) |
| 2. Share a decision with a teammate or reviewer             | At least 1 in 5 signed-in reports gets a share link                                        | `reports.share_id`                              |
| 3. Come back to a past decision and check it is still valid | At least 1 in 4 signed-in reports reaches version 2 (refresh or chat) instead of a new run | `report_versions.source`                        |
| 4. Refine a report in a conversation                        | Every chat version passes the grounding check; median cost per turn under the per-turn cap | `report_versions`, `ai_usage`                   |
| 5. Get a report from the editor (MCP)                       | A report created through MCP meets the same eval quality checks as the form pipeline       | Eval suite, `ai_usage.source`                   |

Use case 1 is the MVP and stays the default without an account.

## Decisions

- Anonymous reports are saved with a unique, unguessable link; anyone with the link can open it.
  They are kept for 30 days and then deleted, and can be deleted earlier from the link. They are
  read-only: no chat, no refresh, no new versions.
- Reports of signed-in users are private and kept until the user deletes them or the account. The
  owner can create a read-only share link and revoke it.
- No teams and no package policy; see Later in `plan-platform.md`.

## Plan parts by use case

| Part                                           | Use case                                          |
| ---------------------------------------------- | ------------------------------------------------- |
| Platform 1: Product requirements               | All: sets the goals                               |
| Platform 2: Regression check and feature flags | All: keeps the product working                    |
| Platform 3: Drizzle ORM and migrations         | All: keeps the product working                    |
| Platform 4: Accounts and limits                | 2, 3, 4, 5: needed for private reports and limits |
| Platform 5: Saved reports and links            | 2                                                 |
| Platform 6: History, freshness and export      | 3                                                 |
| Platform 7: Observability and usage            | All: makes the goals measurable                   |
| Agents 1: Eval suite and baseline              | All: makes the goals measurable                   |
| Agents 2: Tool layer                           | 4, 5                                              |
| Agents 3: Chat to refine a saved report        | 4                                                 |
| Agents 4: Chat to create a report              | 4                                                 |
| Agents 5: MCP server                           | 5                                                 |
| Agents 6: Failure drill                        | All: keeps the product working                    |
| Agents 7: README and demo                      | All: explains the product                         |
