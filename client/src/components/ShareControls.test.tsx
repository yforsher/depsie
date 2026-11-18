import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedReport } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareControls } from './ShareControls';

const id = '00000000-0000-4000-8000-000000000001';
const anonymous: SavedReport = {
  id,
  expiresAt: '2026-11-27T10:00:00.000Z',
  shareId: null,
  owned: false,
};

function stubShare(answers: SavedReport[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(answers.shift()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setup(saved: SavedReport) {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShareControls saved={saved} openLink />
    </QueryClientProvider>,
  );
  return { user, writeText };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ShareControls', () => {
  it('creates a link for an anonymous report, then shows it with its deletion date', async () => {
    const fetchMock = stubShare([
      { ...anonymous, shareId: 'abc', expiresAt: '2026-12-17T10:00:00.000Z' },
    ]);
    const { user, writeText } = setup(anonymous);
    expect(screen.getByText(/deleted on Nov 27, 2026/)).toHaveTextContent(
      'Not shared: it is shown only on this page until you create a share link. It is deleted on Nov 27, 2026, or 30 days after its creation once it has a link.',
    );

    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}/share`, { method: 'POST' });
    const link = await screen.findByRole('textbox', { name: 'Share link' });
    expect(link).toHaveValue(`${location.origin}/s/abc`);
    expect(screen.getByText(/deleted on Dec 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create share link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke link' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/s/abc`);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('lets the owner of a signed-in report open it, revoke its link and create a new one', async () => {
    const owned = { ...anonymous, owned: true, shareId: 'first' };
    const fetchMock = stubShare([
      { ...owned, shareId: null },
      { ...owned, shareId: 'second' },
    ]);
    const { user } = setup(owned);
    expect(screen.getByRole('link', { name: 'Open saved report' })).toHaveAttribute(
      'href',
      `/reports/${id}`,
    );
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${location.origin}/s/first`,
    );

    await user.click(screen.getByRole('button', { name: 'Revoke link' }));
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}/share`, { method: 'DELETE' });
    expect(
      await screen.findByText(
        /^Private: only you can open this report until you create a share link./,
      ),
    ).toHaveTextContent(
      'Private: only you can open this report until you create a share link. It is deleted on Nov 27, 2026, 100 days after its latest version.',
    );
    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    expect(await screen.findByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${location.origin}/s/second`,
    );
  });

  it('says when a link could not be changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Report not found.' }, { status: 404 })),
    );
    const { user } = setup(anonymous);

    await user.click(screen.getByRole('button', { name: 'Create share link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The link could not be changed. The report may have expired.',
    );
  });
});
