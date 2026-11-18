import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportToMarkdown } from '../markdown';
import { mockReport } from '../mockReport';
import { ReportView } from './ReportView';

describe('ReportView', () => {
  it('ranks candidates in order and marks the top pick as recommended', () => {
    render(<ReportView report={mockReport} />);

    const ranking = within(screen.getByRole('region', { name: 'Ranking' }));
    const cards = ranking.getAllByRole('listitem').filter((li) => li.matches('.candidate'));
    expect(cards.map((card) => within(card).getAllByRole('link')[0]!.textContent)).toEqual([
      'react-day-picker@9.11.1',
      'react-datepicker@8.8.0',
    ]);
    expect(within(cards[0]!).getByText('Recommended')).toBeInTheDocument();
    expect(within(cards[1]!).queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('shows key facts, pros and cons on the top card', () => {
    render(<ReportView report={mockReport} />);

    const top = screen.getByRole('link', { name: 'react-day-picker@9.11.1' }).closest('li')!;
    expect(within(top).getByText('Customizable Date Picker for React')).toBeInTheDocument();
    expect(within(top).getByText('License')).toBeInTheDocument();
    expect(within(top).getByText('Known vulnerabilities').nextSibling).toHaveTextContent(
      'OK 0 known (OSV)',
    );
    expect(within(top).getByText('Maintainers').nextSibling).toHaveTextContent('gpbl (npm)');
    expect(within(top).getByText('Weekly downloads').nextSibling).toHaveTextContent(
      '6,104,220 (npm)',
    );
    expect(within(top).getByText('Stars').nextSibling).toHaveTextContent('6,512 (GitHub)');
    expect(within(top).getByRole('heading', { name: 'Pros' }).nextSibling).toHaveTextContent(
      '6.1 million weekly downloads, the most of the candidates. (npm)',
    );
    expect(within(top).getByRole('heading', { name: 'Cons' }).nextSibling).toHaveTextContent(
      'Unpacked size 2.1 MB, the largest of the candidates. (npm)',
    );
    expect(within(top).queryByText('Evidence')).not.toBeInTheDocument();
  });

  it('shows the summary above the cards, outside any card', () => {
    render(<ReportView report={mockReport} />);

    const summary = screen.getByRole('heading', { name: 'Why react-day-picker' }).parentElement!;
    expect(summary).toHaveTextContent(
      'Ships TypeScript types and declares react >=16.8.0 as its only peer dependency, with the most weekly downloads of the candidates. (npm)',
    );
    expect(summary.closest('li')).toBeNull();
  });

  it('shows counts and unavailable data on the second card', () => {
    render(<ReportView report={mockReport} />);

    const second = screen.getByRole('link', { name: 'react-datepicker@8.8.0' }).closest('li')!;
    expect(within(second).getByText('Known vulnerabilities').nextSibling).toHaveTextContent(
      'Risk 4 known (OSV)',
    );
    expect(within(second).getByText('Maintainers').nextSibling).toHaveTextContent('2 (npm)');
    expect(within(second).getByText('Stars').nextSibling).toHaveTextContent('unavailable (GitHub)');
  });

  it('shows a GitHub badge only when the package has a repository', () => {
    render(<ReportView report={mockReport} />);

    const badges = screen
      .getAllByRole('link', { name: 'GitHub' })
      .filter((link) => link.closest('.candidate'));
    expect(badges.map((badge) => badge.getAttribute('href'))).toEqual([
      'https://github.com/gpbl/react-day-picker',
      'https://github.com/react-dates/react-dates',
    ]);
  });

  it('shows the cons of alternatives, with pros and facts collapsed, and data sources', () => {
    render(<ReportView report={mockReport} />);

    const rejected = within(screen.getByRole('region', { name: 'Alternatives considered' }));
    expect(rejected.getByRole('link', { name: 'react-dates@21.8.0' })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/react-dates/v/21.8.0',
    );
    const alternative = document.querySelector('.candidate.rejected')!;
    const [cons, collapsed] = [
      alternative.querySelector('.claims-cons')!,
      alternative.querySelector('details')!,
    ];
    expect(cons.closest('details')).toBeNull();
    expect(cons).toHaveTextContent('Peer dependency react ^0.14 || ^15.5.4 || ^16.1.1. (npm)');
    expect(collapsed).not.toHaveAttribute('open');
    expect(within(collapsed).getByText('Pros and facts')).toBeInTheDocument();
    expect(collapsed).toHaveTextContent('Supports date range selection according to its README.');

    const sources = within(screen.getByRole('heading', { name: 'Data sources' }).parentElement!);
    const items = sources.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'npm, fetched Oct 22, 2026',
      'deps.dev, fetched Oct 22, 2026',
      'OSV, fetched Oct 22, 2026',
      'GitHub, fetched Oct 22, 2026',
    ]);
    items.forEach((item) => expect(item).toHaveTextContent('fetched Oct 22, 2026'));
  });

  it('links only the sources a card does not already link, in a new tab', () => {
    render(<ReportView report={mockReport} />);

    const cardLinks = screen
      .getAllByRole('link')
      .filter((link) => link.closest('.candidate'))
      .map((link) => link.textContent);
    expect(new Set(cardLinks)).toEqual(
      new Set([
        'react-day-picker@9.11.1',
        'react-datepicker@8.8.0',
        'react-dates@21.8.0',
        'GitHub',
        'OSV',
        'deps.dev',
      ]),
    );
    expect(
      screen.queryByRole('link', { name: /weekly downloads, the most/ }),
    ).not.toBeInTheDocument();
    const osv = screen.getAllByRole('link', { name: 'OSV' })[0]!;
    expect(osv).toHaveAttribute('href', 'https://osv.dev/list?ecosystem=npm&q=react-day-picker');
    expect(osv).toHaveAttribute(
      'title',
      'react-day-picker vulnerabilities.known, fetched Oct 22, 2026',
    );
    screen.getAllByRole('link').forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('labels every status with text, not only color', () => {
    render(<ReportView report={mockReport} />);

    const statuses = document.querySelectorAll('.status');
    // License, vulnerabilities, dependencies and release activity; the rest are neutral.
    expect(statuses).toHaveLength(mockReport.security.length * 4);
    statuses.forEach((status) => expect(status.textContent).toMatch(/^(OK|Caution|Risk)$/));
    expect(screen.getByText('Caution')).toBeInTheDocument();
  });
});

describe('ReportView freshness', () => {
  // mockReport was generated on 2026-10-22 at 09:00 UTC.
  const viewedAfter = (days: number) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(mockReport.generatedAt) + days * 24 * 60 * 60 * 1000));
  };
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the data was fetched today, with no warning, on a new report', () => {
    viewedAfter(0);
    render(<ReportView report={mockReport} />);
    expect(screen.getByText('Data fetched Oct 22, 2026, today.')).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Old data' })).not.toBeInTheDocument();
  });

  it('says how many days ago the data was fetched', () => {
    viewedAfter(3);
    render(<ReportView report={mockReport} />);
    expect(screen.getByText('Data fetched Oct 22, 2026, 3 days ago.')).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Old data' })).not.toBeInTheDocument();
  });

  it('warns with the given action when the data is 7 days old or more', () => {
    viewedAfter(10);
    render(<ReportView report={mockReport} staleAction={<button type="button">Refresh</button>} />);
    const warning = screen.getByRole('note', { name: 'Old data' });
    expect(warning).toHaveTextContent(
      'Releases and vulnerabilities may have changed since the data was fetched.',
    );
    expect(within(warning).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('ReportView Markdown download', () => {
  it('saves the report as a Markdown file named after its generation date', async () => {
    // jsdom has no object URLs and does not follow links: record what would be downloaded.
    let blob: Blob | undefined;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => ((blob = b), 'blob:report'),
      revokeObjectURL: () => {},
    });
    let download: { name: string; href: string } | undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      download = { name: this.download, href: this.href };
    });

    render(<ReportView report={mockReport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    expect(download).toEqual({ name: 'depsie-2026-10-22.md', href: 'blob:report' });
    expect(blob!.type).toBe('text/markdown');
    expect(await blob!.text()).toBe(reportToMarkdown(mockReport));
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
