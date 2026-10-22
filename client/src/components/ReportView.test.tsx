import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockReport } from '../mockReport';
import { ReportView } from './ReportView';

describe('ReportView', () => {
  it('renders ranking, alternatives, security and sources', () => {
    render(<ReportView report={mockReport} />);

    const ranking = screen.getByRole('heading', { name: 'Ranking' }).parentElement!;
    expect(within(ranking).getByText('1. react-day-picker@9.11.1')).toBeInTheDocument();
    expect(within(ranking).getByText('2. react-datepicker@8.8.0')).toBeInTheDocument();

    expect(screen.getByText('react-dates@21.8.0')).toBeInTheDocument();
    expect(screen.getByText('Last release was published on 2020-03-27.')).toBeInTheDocument();

    expect(screen.getByRole('table')).toBeInTheDocument();
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
