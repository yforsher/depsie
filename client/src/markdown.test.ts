import { describe, expect, it } from 'vitest';
import { reportToMarkdown } from './markdown';
import { mockReport } from './mockReport';

describe('reportToMarkdown', () => {
  const markdown = reportToMarkdown(mockReport);

  it('matches the saved snapshot', async () => {
    await expect(markdown).toMatchFileSnapshot('./__snapshots__/report.md');
  });

  it('starts with the need, framework, generation date and fetch date', () => {
    expect(markdown).toMatch(
      /^# Recommendation\n\nA date picker \(React\), generated Oct 22, 2026\. Data fetched Oct 22, 2026\.\n/,
    );
  });

  it('has the summary of why the top pick was chosen, with its sources', () => {
    expect(markdown).toContain(
      '### Why react-day-picker\n\nShips TypeScript types and declares react >=16.8.0 as its only peer dependency, with the most weekly downloads of the candidates. (npm)',
    );
  });

  it('has every ranked candidate with its facts, pros and cons', () => {
    expect(markdown).toContain('### 1. react-day-picker@9.11.1 (Recommended)');
    expect(markdown).toContain('### 2. react-datepicker@8.8.0');
    expect(markdown).toContain('- 6.1 million weekly downloads, the most of the candidates. (npm)');
    expect(markdown).toContain(
      '- Declares react >=16.8.0 as a peer dependency; no known vulnerabilities. (npm, OSV)',
    );
    expect(markdown).toContain('- Has 6 dependencies against 1 for react-day-picker. (deps.dev)');
  });

  it('has every security fact with its status label', () => {
    expect(markdown).toContain('- License: OK, MIT (npm)');
    expect(markdown).toContain('- Known vulnerabilities: Risk, 4 known (OSV)');
    expect(markdown).toContain('- Dependencies: Caution, 6 (deps.dev)');
    expect(markdown).toContain('- Maintainers: gpbl (npm)');
    expect(markdown).toContain('- Stars: unavailable (GitHub)');
  });

  it('has the rejected alternatives with their cons', () => {
    expect(markdown).toContain('## Alternatives considered');
    expect(markdown).toContain('### react-dates@21.8.0');
    expect(markdown).toContain('- Peer dependency react ^0.14 || ^15.5.4 || ^16.1.1. (npm)');
  });

  it('has every data source with its fetch date', () => {
    expect(markdown).toContain('## Data sources');
    for (const name of ['npm', 'deps.dev', 'OSV', 'GitHub']) {
      expect(markdown).toMatch(
        new RegExp(`- \\[${name}\\]\\(https://[^)]+\\), fetched Oct 22, 2026`),
      );
    }
  });
});
