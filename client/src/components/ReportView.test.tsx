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

  it('shows key facts and reasons on each ranked card', () => {
    render(<ReportView report={mockReport} />);

    const top = screen.getByRole('link', { name: 'react-day-picker@9.11.1' }).closest('li')!;
    expect(within(top).getByText('License')).toBeInTheDocument();
    expect(within(top).getAllByText('No known vulnerabilities for 9.11.1.')).not.toHaveLength(0);
    expect(
      within(top).getAllByText('6.1 million weekly downloads, the highest of the candidates.'),
    ).not.toHaveLength(0);
  });

  it('renders alternatives with their reason, and data sources', () => {
    render(<ReportView report={mockReport} />);

    const rejected = within(screen.getByRole('region', { name: 'Alternatives considered' }));
    expect(rejected.getByRole('link', { name: 'react-dates@21.8.0' })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/react-dates/v/21.8.0',
    );
    expect(rejected.getAllByText('Last release was published on 2020-03-27.')).not.toHaveLength(0);

    expect(screen.getByRole('link', { name: 'OSV.dev' })).toBeInTheDocument();
    expect(screen.getAllByText(/fetched 2026-10-22/)).toHaveLength(mockReport.sources.length);
  });

  it('shows evidence with package, field, source and fetch date', () => {
    render(<ReportView report={mockReport} />);

    expect(
      screen.getAllByText('react-day-picker downloads.weekly, npm downloads API, 2026-10-22'),
    ).not.toHaveLength(0);
  });

  it('labels every status with text, not only color', () => {
    render(<ReportView report={mockReport} />);

    const statuses = document.querySelectorAll('.status');
    expect(statuses).toHaveLength(mockReport.security.length * 5);
    statuses.forEach((status) => expect(status.textContent).toMatch(/^(OK|Caution|Risk)$/));
    expect(screen.getByText('Caution')).toBeInTheDocument();
  });
});
