import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OwnedReport, SharedReport } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockReport } from '../mockReport';
import { alice, calledUrls, renderAt, stubServer } from '../testRouter';

const id = '00000000-0000-4000-8000-000000000001';
const shared: SharedReport = {
  report: mockReport,
  expiresAt: '2026-12-17T10:00:00.000Z',
  deletable: true,
  olderFormat: false,
};
const owned: OwnedReport = {
  id,
  report: mockReport,
  expiresAt: '2027-02-25T10:00:00.000Z',
  shareId: 'abc',
  owned: true,
  olderFormat: false,
};
const flagsOn = { enabled: ['report-links' as const, 'accounts' as const], signIn: true };
const notFound = () => Response.json({ error: 'Report not found.' }, { status: 404 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/s/:shareId', () => {
  it('shows the shared report read-only with its deletion date', async () => {
    stubServer(flagsOn, null, {
      '/api/s/abc': () => Response.json({ ...shared, deletable: false }),
    });
    renderAt('/s/abc');

    expect(await screen.findByRole('heading', { name: 'Recommendation' })).toBeInTheDocument();
    expect(screen.getByText(/deleted on Dec 17, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('What do you need?')).not.toBeInTheDocument();
  });

  it('deletes an anonymous report after a confirmation', async () => {
    const fetchMock = stubServer(flagsOn, null, {
      '/api/s/abc': () => Response.json(shared),
    });
    renderAt('/s/abc');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete report' }));
    expect(calledUrls(fetchMock).filter((url) => url.endsWith('/api/s/abc'))).toHaveLength(1);
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByText('This report was deleted.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/s/abc', { method: 'DELETE' });
    expect(screen.queryByRole('heading', { name: 'Recommendation' })).not.toBeInTheDocument();
  });

  it('says when the link does not exist or has expired', async () => {
    stubServer(flagsOn, null, { '/api/s/gone': notFound });
    renderAt('/s/gone');

    expect(await screen.findByText('This link does not exist or has expired.')).toBeInTheDocument();
  });

  it('notes a report saved in an older format', async () => {
    stubServer(flagsOn, null, {
      '/api/s/old': () => Response.json({ ...shared, olderFormat: true }),
    });
    renderAt('/s/old');

    expect(await screen.findByText(/saved in an older format/)).toBeInTheDocument();
  });
});

describe('/reports/:id', () => {
  it("shows the owner's report with its share controls", async () => {
    stubServer(flagsOn, alice, { [`/api/reports/${id}`]: () => Response.json(owned) });
    renderAt(`/reports/${id}`);

    expect(await screen.findByRole('heading', { name: 'Recommendation' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      `${location.origin}/s/abc`,
    );
    expect(screen.getByRole('button', { name: 'Revoke link' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open saved report' })).not.toBeInTheDocument();
  });

  it('shows an older-format report read-only, without share controls', async () => {
    stubServer(flagsOn, alice, {
      [`/api/reports/${id}`]: () => Response.json({ ...owned, olderFormat: true }),
    });
    renderAt(`/reports/${id}`);

    expect(await screen.findByText(/saved in an older format/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    stubServer(flagsOn, null);
    const { router } = renderAt(`/reports/${id}`);

    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
  });

  it('sends everyone home while sign-in does not exist', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    const { router } = renderAt(`/reports/${id}`);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('says when the report is not found', async () => {
    stubServer(flagsOn, alice, { [`/api/reports/${id}`]: notFound });
    renderAt(`/reports/${id}`);

    expect(
      await screen.findByText('Report not found. It may have been deleted or expired.'),
    ).toBeInTheDocument();
  });
});
