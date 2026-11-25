import { screen, waitFor, within } from '@testing-library/react';
import type { UsageResponse } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alice, renderAt, stubServer } from '../testRouter';

const flagsOn = { enabled: ['accounts' as const], signIn: true };
const usage: UsageResponse = {
  days: [
    { day: '2026-11-22', reports: 1, tokens: 4321 },
    { day: '2026-11-21', reports: 2, tokens: 8642 },
  ],
  todayReports: 1,
  dailyCap: 10,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/usage', () => {
  it("shows today's reports against the cap and one row per day, newest first, with no dollar amount", async () => {
    stubServer(flagsOn, alice, { '/api/usage': () => Response.json(usage) });
    renderAt('/usage');

    expect(await screen.findByText('Today: 1 of 10 reports')).toBeInTheDocument();
    expect(screen.getByRole('main').textContent).not.toContain('$');
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const cells = rows.map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      ['Nov 22, 2026', '1', '4,321'],
      ['Nov 21, 2026', '2', '8,642'],
    ]);
  });

  it('says when there is no usage yet', async () => {
    stubServer(flagsOn, alice, {
      '/api/usage': () => Response.json({ days: [], todayReports: 0, dailyCap: 10 }),
    });
    renderAt('/usage');

    expect(await screen.findByText('Today: 0 of 10 reports')).toBeInTheDocument();
    expect(screen.getByText(/no usage yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    stubServer(flagsOn, null);
    const { router } = renderAt('/usage');

    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
  });

  it('sends everyone home while sign-in does not exist', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    const { router } = renderAt('/usage');

    expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
