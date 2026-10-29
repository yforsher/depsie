import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
