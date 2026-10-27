# Client

React, TypeScript, Vite, TanStack Query. Tests with Vitest and React Testing Library.

The client handles the need + framework form, parses package.json locally, shows the "what is
sent" preview, renders the report, and exports it as Markdown. The Markdown is built from the
structured report in code, without an AI call.

## package.json privacy rules

- package.json is optional and can be pasted or uploaded. It is parsed and filtered in the browser
  with no network calls; the raw file is never sent.
- Scoped packages are sent only if their scope is in `allowlist.json`, which a settings field can
  extend.
- Entries whose declared range is not a semver range or dist-tag (for example `git+ssh:`, `git:`,
  `github:`, `file:`, `link:`, `workspace:`, or a URL) are never sent, because they can reveal
  internal hosts and paths.
- Before sending, the preview shows exactly what goes to the server: need, framework, and the
  filtered public dependency names and declared version ranges. It also lists every entry that is
  not sent and why.

## Server API

A single `POST /api/report` call with `{ need, framework, dependencies? }` (types in `shared/`).
Show a clear message for each error: 400 (invalid input), 429 (rate limit), 502 (AI failure).

## Color scheme

Dark navy background with light text. Single theme (dark only). All text colors pass WCAG AA
(4.5:1) on every background below.

| Token              | Hex       | Use                                                | Contrast on bg  |
| ------------------ | --------- | -------------------------------------------------- | --------------- |
| `--bg`             | `#0B1426` | Page background                                    | -               |
| `--surface`        | `#13203A` | Cards, table, panels                               | -               |
| `--surface-raised` | `#1B2B4A` | Inputs, hover rows, menus                          | -               |
| `--border`         | `#2A3B5C` | Borders, dividers                                  | decorative      |
| `--text`           | `#E6EDF7` | Primary text, headings                             | 15.6:1          |
| `--text-secondary` | `#A9B6CC` | Body copy, labels                                  | 9.0:1           |
| `--text-muted`     | `#8494AE` | Hints, timestamps, captions                        | 6.0:1           |
| `--accent`         | `#5AB0FF` | Links, primary buttons, focus ring, selected state | 8.0:1           |
| `--accent-hover`   | `#82C4FF` | Hover on accent elements                           | -               |
| `--on-accent`      | `#0B1426` | Text on accent buttons                             | 8.0:1 on accent |
| `--success`        | `#3DD68C` | Recommended package, passing checks                | 9.8:1           |
| `--warning`        | `#F5B84A` | Outdated, low maintenance, license caution         | 10.4:1          |
| `--danger`         | `#FF7A7A` | Known vulnerabilities, incompatible license        | 7.3:1           |

```css
:root {
  --bg: #0b1426;
  --surface: #13203a;
  --surface-raised: #1b2b4a;
  --border: #2a3b5c;
  --text: #e6edf7;
  --text-secondary: #a9b6cc;
  --text-muted: #8494ae;
  --accent: #5ab0ff;
  --accent-hover: #82c4ff;
  --on-accent: #0b1426;
  --success: #3dd68c;
  --warning: #f5b84a;
  --danger: #ff7a7a;
}
```

Rules: use only these tokens, never raw hex in components. Status colors always come with a text
label or icon, never color alone.

## Code structure

- `src/main.tsx`: entry point with the TanStack Query provider.
- `src/App.tsx`: runs the report request as a mutation. Two columns from 960px: the form on the
  left, the result column on the right with an empty, loading, error or report state.
- `src/api.ts`: `fetchReport()`, the only function that talks to the server (`POST /api/report`).
  Turns 400, 429, 502 and any other failure status into a clear error message.
- `src/mockReport.ts`: a fixed report used by the tests.
- `vite.config.ts`: in dev, `/api` is proxied to the Express server on port 3000.
- `src/packageJson.ts`: parsing and privacy filtering (scope allowlist, non-registry ranges).
  `src/allowlist.json` holds the allowed scopes.
- `src/components/RequestForm.tsx`: need, framework, optional package.json, extra scopes,
  validation (need at most 500 characters, at most 200 dependencies).
  Enter in the need or framework field submits once both are filled; Shift+Enter adds a line.
- `src/components/SentPreview.tsx`: the "what is sent" preview, including entries not sent.
- `src/components/PrivacyNote.tsx`: a "How your data is handled" link under the preview that opens
  the privacy details in a native `<dialog>`. Keep the text in line with the privacy constraints
  in the root `AGENTS.md` whenever they change. jsdom lacks the dialog methods, so
  `src/test-setup.ts` stubs `showModal()` and `close()`.
- `src/components/ReportView.tsx`: one card per ranked candidate (the top pick marked
  Recommended) with its security facts, reasons and collapsed evidence; compact rejected
  alternatives; data sources at the bottom.
- `src/index.css`: color tokens and all styles.
- Tests sit next to the code as `*.test.ts(x)`; `src/test-setup.ts` registers jest-dom and
  cleanup.
- Request and report types come from the `shared` workspace package.
