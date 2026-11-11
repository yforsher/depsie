# Agents plan

Starts after the platform plan (`plan-platform.md`): it uses its accounts, saved report versions,
share links, limits, feature flags and traces. This plan adds an eval suite, a tool layer, a chat
agent that refines saved reports and creates new ones, and an MCP server, each measured against the
MVP pipeline.

Rules:

- One part at a time; the agent checks off substeps and does not start the next part until the
  success criteria pass and the user approves.
- Anonymous use needs no account, as today. Chat and MCP are for signed-in users only.
- Permissions, limits and data rules are enforced in code, never by the model.
- Every agent feature has a cost cap and a step limit in code, counts toward the user's daily cost
  cap, and is measured with the eval suite before it is turned on for everyone.
- Existing functionality keeps working after every part: all existing tests and the smoke test
  pass, in CI and against the live URL after the deploy. A test changes only when the behavior
  change is intended, and the commit says why.
- A new feature stays hidden behind a feature flag until it gives the user value on its own.
  Turning a flag on is the user's decision, recorded in this file with the date; the flag is
  removed in a later small change once the feature is on and working.
- Flags can be a list of GitHub logins (platform plan, Part 4), so each feature is tested on the
  live URL before it is turned on.
- Finished parts stay in this file, checked off, with their measurements.
- Fill in the code structure in `client/AGENTS.md` and `server/AGENTS.md` as each part is built.

Feature flags in this plan, each turned on after its part passes and the eval results support it:
`chat` (Part 3), `chat-create` (Part 4), `mcp` (Part 5).

## Part 1: Eval suite and baseline

- [ ] `evals/`: 15 to 20 needs covering both frameworks, with and without package.json, each with
      expectations (packages that must or must not be in the top 3)
- [ ] Automatic checks per run: valid schema, every evidence reference valid, rank 1 stable over 3
      runs, expectations met, cost and time
- [ ] `pnpm eval` writes a results table; a manual GitHub Actions workflow runs it
- [ ] Package data is fetched live and changes over time, so every comparison runs the baseline
      and the candidate on the same day, and each results table records its date
- [ ] Record the MVP pipeline as the baseline in `docs/evals.md`

Tests: the scoring functions on fixed outputs.

Success criteria: a baseline table that later parts are compared against.

## Part 2: Tool layer

- [ ] One module that exposes the existing server functions as tools, each with a name, a
      description, a Zod input schema and a typed result: `searchPackages`, `getPackageData`,
      `checkVulnerabilities`, `getReport`, `saveReportVersion`
- [ ] The pipeline calls the same functions, so there is one implementation

Tests: each tool validates its input and returns the expected shape on fixtures.

Success criteria: all existing report tests pass unchanged on top of the tool layer.

## Part 3: Chat to refine a saved report

- [ ] Chat panel on a saved report, for its signed-in owner only ("add an option with no
      dependencies", "does the second one support SSR?"); anonymous and shared reports stay
      read-only
- [ ] Tool-calling loop on the server with the Part 2 tools, directly on the OpenRouter API (no
      agent framework), streamed to the client (SSE), with each tool call shown as a step
- [ ] Limits in code: maximum steps per turn, maximum cost per conversation; only
      `saveReportVersion` writes
- [ ] Every change is a new version with source `chat` that passes the MVP grounding check; the
      version list shows what each turn changed
- [ ] Messages stored per report (`report_messages`), deleted with the report and with the
      account; each turn writes its cost to `ai_usage` and is one trace with a span per tool call
- [ ] Update the privacy note and `AGENTS.md`: chat messages are stored with the report
- [ ] Behind the `chat` flag

Tests: the loop stops at the step limit; a reply with an unfetched evidence reference is rejected;
chat returns 401 without a session and 404 on another user's report; a turn that changes nothing
still writes its cost; deleting a report deletes its messages.

Success criteria: three turns on a live report produce versions 2 to 4, each passing the grounding
check, within the cost cap.

## Part 4: Chat to create a report

- [ ] A signed-in user can start a new report in the chat instead of the form: the agent may ask
      up to two clarifying questions (a limit in code), then uses the tools to search, fetch and
      decide which packages to compare, and may search again; the result is saved as version 1
      with source `agent`, and the same chat continues as the Part 3 refine chat
- [ ] package.json in the chat follows the same rules as the form: parsed and filtered in the
      browser, and only filtered dependency names and version ranges reach the server
- [ ] Run the eval suite on chat creation (the need as the first message, no clarifying answers)
      and on the pipeline on the same day, and compare: quality checks, cost, time
- [ ] `docs/decisions/chat-vs-form.md`: where the agent is better, where the fixed pipeline is
      better, and what the default is for signed-in users, with the numbers; the form stays for
      anonymous use
- [ ] Behind the `chat-create` flag

Tests: the agent stops after two questions; the same limits and grounding check as Part 3; the
request from a chat with package.json contains only filtered dependencies.

Success criteria: the decision document is written from eval results, and a live chat creates a
report that passes the grounding check within the cost cap.

## Part 5: MCP server

- [ ] Remote MCP endpoint (Streamable HTTP) on the same server, using the official MCP SDK, exposing
      the Part 2 tools plus `createReport`
- [ ] Personal API keys created by the signed-in user (`api_keys`: hashed, shown once, revocable);
      every call runs under that user's limits, appears in their usage page, and reports it
      creates are saved to their history
- [ ] Input from MCP does not pass through the browser, so the server applies the same dependency
      filtering rules as the client (one shared module in `shared/`)
- [ ] Setup guide: connect Claude Code in a repo and ask "find a date library that fits this
      project"; Claude Code reads package.json locally and sends only what the tools take
- [ ] Behind the `mcp` flag

Tests: calls without a key or with a revoked key fail; a tool through MCP returns the same result
as the direct call; unfiltered dependencies sent through MCP are filtered on the server.

Success criteria: Claude Code connected to the live endpoint creates a report that appears in the
user's history.

## Part 6: Failure drill

- [ ] Simulate one failure (for example OSV unavailable, or the AI provider timing out in the
      middle of a chat turn), find it from logs and traces only, fix the behavior (clear error or
      degraded result), and write `docs/postmortems/001.md` (timeline, root cause, fix,
      follow-ups)

Tests: the failure has a test.

Success criteria: the postmortem is written and the fix is deployed.

## Part 7: README and demo

- [ ] Architecture diagram: client, server, database, AI provider, tools, agent loop, MCP,
      scheduled cleanup
- [ ] README: the problem, what Depsie does for a developer, the diagram, the eval results, links
      to the live demo, the decision document and the postmortem
- [ ] Demo video of about 3 minutes: a report and its share link, creating a report in the chat,
      refining it, MCP in Claude Code

Tests: none.

Success criteria: someone who has not seen the project understands from the README alone what it
does and how it is built.

## Later

Not planned; recorded so the design does not block it.

- Pull request check (GitHub App): a separate install on repositories the user picks, with only
  Pull requests (read), Contents (read) and Checks (write); installed from Depsie while signed in
  so the installation is linked to the user; webhook signature check, duplicate deliveries
  ignored, work done in the background; posts a check run with a share link to the report
- Vulnerability watch: a daily job that re-checks the packages in saved reports against OSV and
  marks reports with a new high or critical vulnerability, with a notification in Depsie or by
  Slack
