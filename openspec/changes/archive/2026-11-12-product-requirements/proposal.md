# Proposal

## Why

The platform and agents plans add accounts, saved reports, share links, chat and MCP. But
`AGENTS.md` still states the MVP rules ("no storage of user input or generated reports, no
shareable reports, no chat"), and no document says who the product is for or how to tell whether
a part worked. Part 1 of `docs/plan-platform.md` fixes this before any code changes.

## What Changes

- New `docs/product.md`:
  - who uses Depsie: a developer choosing a package, anonymous or signed in
  - the main use cases, each with a measurable goal and the data that measures it
  - each part of the platform and agents plans mapped to the use case it serves
  - the storage and sharing decisions: anonymous reports have a link and are deleted after 30
    days; signed-in reports are private and can get a share link that the owner revokes; no
    teams and no package policy (Later)
- `AGENTS.md`: update the business requirements, the out-of-scope list and the privacy
  constraints for the platform and agents plans. The MVP rule "no storage of user input or
  generated reports, and no shareable reports" is replaced by the decisions in
  `docs/product.md`. The package.json rules (filtered in the browser) stay as they are. The
  "no chat, fixed AI calls" rule stays for the anonymous form, and chat gets limits enforced in
  code.
- No code changes. The README privacy section and the in-app privacy note stay as they are
  until Part 5, because they describe what the live site does today.

## Capabilities

### New Capabilities

None. This part records product decisions. The behavior they describe gets its specs in the
changes that build it (Parts 4 to 6), so this change sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- Files: `docs/product.md` (new), `AGENTS.md`.
- No change to code, APIs, the database or the deploy. Existing tests are unaffected.
- Later parts and agents read `AGENTS.md` as the source of truth, so from now on they work from
  the new rules.
