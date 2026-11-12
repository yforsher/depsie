# Product requirements

## Who uses Depsie

A JavaScript or TypeScript developer choosing an npm package for a need in their project.

- Anonymous: no account. Fills in the form, gets a report, can create a share link, and leaves.
- Signed in (GitHub): the same form, plus private saved reports, history, refresh, share links,
  chat and MCP.

## Use cases

1. Pick a package for a need, with no account. This is the MVP and stays the default without an
   account.
2. Share a decision with a teammate or reviewer.
3. Come back to a past decision and check it is still valid.
4. Refine a report in a conversation.
5. Get a report from the editor (MCP).

## Decisions

- Every report is saved, and deleted after a retention period. The periods are constants in one
  place, so they are easy to change:

  | Report                       | Kept for                                                    |
  | ---------------------------- | ----------------------------------------------------------- |
  | Anonymous, without a link    | 10 days from its creation                                   |
  | Anonymous, with a share link | 30 days from its creation                                   |
  | Signed-in user               | 100 days from its latest version (refresh or chat restarts) |

- An anonymous report gets a share link only when the user creates one with a button. The link is
  unique and unguessable, and anyone with it can open the report. The report can be deleted
  earlier from the link. It is read-only: no chat, no refresh, no new versions.
- Reports of signed-in users are private. The user can delete them earlier, and deleting the
  account deletes them. The owner can create a read-only share link and revoke it.
- No teams and no package policy; see Later in `plan-platform.md`.

## Plan parts by use case

| Part                                           | Use case                                          |
| ---------------------------------------------- | ------------------------------------------------- |
| Platform 1: Product requirements               | All: sets the use cases                           |
| Platform 2: Regression check and feature flags | All: keeps the product working                    |
| Platform 3: Drizzle ORM and migrations         | All: keeps the product working                    |
| Platform 4: Accounts and limits                | 2, 3, 4, 5: needed for private reports and limits |
| Platform 5: Saved reports and links            | 2                                                 |
| Platform 6: History, freshness and export      | 3                                                 |
| Platform 7: Observability and usage            | All: shows time, cost and errors                  |
| Agents 1: Eval suite and baseline              | All: measures report quality                      |
| Agents 2: Tool layer                           | 4, 5                                              |
| Agents 3: Chat to refine a saved report        | 4                                                 |
| Agents 4: Chat to create a report              | 4                                                 |
| Agents 5: MCP server                           | 5                                                 |
| Agents 6: Failure drill                        | All: keeps the product working                    |
| Agents 7: README and demo                      | All: explains the product                         |
