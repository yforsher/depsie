import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OwnedReport, ReportSummary, SharedReport } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  version: 1,
  versions: [{ version: 1, source: 'pipeline', createdAt: mockReport.generatedAt }],
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

describe('/reports', () => {
  const second = '00000000-0000-4000-8000-000000000002';
  const summaries: ReportSummary[] = [
    {
      id,
      need: 'A date picker',
      framework: 'React',
      updatedAt: '2026-11-18T10:00:00.000Z',
      versionCount: 2,
      shared: true,
    },
    {
      id: second,
      need: 'Validate forms',
      framework: 'Vue',
      updatedAt: '2026-11-10T10:00:00.000Z',
      versionCount: 1,
      shared: false,
    },
  ];

  it("lists the user's reports, each linking to its page", async () => {
    stubServer(flagsOn, alice, { '/api/reports': () => Response.json(summaries) });
    renderAt('/reports');

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'A date picker' })).toHaveAttribute(
      'href',
      `/reports/${id}`,
    );
    expect(rows[0]).toHaveTextContent('React');
    expect(rows[0]).toHaveTextContent('Updated Nov 18, 2026');
    expect(rows[0]).toHaveTextContent('2 versions');
    expect(rows[0]).toHaveTextContent('Shared');
    expect(rows[1]).toHaveTextContent('1 version');
    expect(rows[1]).not.toHaveTextContent('Shared');
  });

  it('deletes a report after a confirmation, then lists the rest', async () => {
    let list = summaries;
    const fetchMock = stubServer(flagsOn, alice, {
      '/api/reports': () => Response.json(list),
      [`/api/reports/${id}`]: () => {
        list = summaries.slice(1);
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/reports');
    const user = userEvent.setup();

    const first = (await screen.findAllByRole('listitem'))[0]!;
    await user.click(within(first).getByRole('button', { name: 'Delete' }));
    expect(calledUrls(fetchMock)).not.toContain(`/api/reports/${id}`);
    await user.click(within(first).getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}`, { method: 'DELETE' });
    expect(screen.queryByRole('link', { name: 'A date picker' })).not.toBeInTheDocument();
  });

  it('says when there are no saved reports yet', async () => {
    stubServer(flagsOn, alice, { '/api/reports': () => Response.json([]) });
    renderAt('/reports');

    expect(await screen.findByText(/no saved reports yet/)).toBeInTheDocument();
  });

  it('sends a visitor who is not signed in to the sign-in page', async () => {
    stubServer(flagsOn, null);
    const { router } = renderAt('/reports');

    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
  });
});

// mockReport was generated on 2026-10-22; these pages are viewed 10 days later.
function viewOnNovember1() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

describe('/reports/:id versions, refresh and delete', () => {
  viewOnNovember1();

  const twoVersions: OwnedReport = {
    ...owned,
    report: { ...mockReport, generatedAt: '2026-11-01T08:59:00Z' },
    version: 2,
    versions: [
      { version: 1, source: 'pipeline', createdAt: '2026-10-22T09:00:05Z' },
      { version: 2, source: 'refresh', createdAt: '2026-11-01T08:59:00Z' },
    ],
  };
  const firstVersion = () => Response.json({ ...twoVersions, version: 1, report: mockReport });

  it('lists the versions with their source and date', async () => {
    stubServer(flagsOn, alice, { [`/api/reports/${id}`]: () => Response.json(twoVersions) });
    renderAt(`/reports/${id}`);

    const versions = within(await screen.findByRole('navigation', { name: 'Versions' }));
    expect(
      versions.getByRole('link', { name: 'Version 1, new report, Oct 22, 2026' }),
    ).toHaveAttribute('href', `/reports/${id}?version=1`);
    expect(versions.getByRole('link', { name: 'Version 2, refresh, Nov 1, 2026' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows an earlier version without refresh or share controls, linking to the latest', async () => {
    stubServer(flagsOn, alice, { [`/api/reports/${id}?version=1`]: firstVersion });
    renderAt(`/reports/${id}?version=1`);

    expect(await screen.findByText(/an earlier version of this report/)).toBeInTheDocument();
    const warning = screen.getByRole('note', { name: 'Old data' });
    expect(within(warning).getByRole('link', { name: 'Open the latest version' })).toHaveAttribute(
      'href',
      `/reports/${id}`,
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('refreshes an old report from its warning and then shows the new version', async () => {
    let answerRefresh: (response: Response) => void = () => {};
    const fetchMock = stubServer(flagsOn, alice, {
      [`/api/reports/${id}`]: () => Response.json(owned),
      [`/api/reports/${id}/refresh`]: () =>
        new Promise<Response>((resolve) => (answerRefresh = resolve)) as unknown as Response,
    });
    renderAt(`/reports/${id}`);
    const user = userEvent.setup();

    const warning = await screen.findByRole('note', { name: 'Old data' });
    await user.click(within(warning).getByRole('button', { name: 'Refresh' }));

    expect(within(warning).getByRole('button', { name: 'Refreshing...' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}/refresh`, { method: 'POST' });
    answerRefresh(Response.json(twoVersions));
    expect(await screen.findByText('Data fetched Nov 1, 2026, today.')).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Old data' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Version 2, refresh, Nov 1, 2026' }),
    ).toBeInTheDocument();
  });

  it('offers Refresh on a report whose data is not old yet, without the warning', async () => {
    const recent = { ...owned, report: { ...mockReport, generatedAt: '2026-10-29T09:00:00Z' } };
    stubServer(flagsOn, alice, { [`/api/reports/${id}`]: () => Response.json(recent) });
    renderAt(`/reports/${id}`);

    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Old data' })).not.toBeInTheDocument();
  });

  it('shows why a refresh failed', async () => {
    stubServer(flagsOn, alice, {
      [`/api/reports/${id}`]: () => Response.json(owned),
      [`/api/reports/${id}/refresh`]: () =>
        Response.json({ error: 'Too many reports: the limit is 10 per hour.' }, { status: 429 }),
    });
    renderAt(`/reports/${id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many reports: the limit is 10 per hour. Please try again later.',
    );
  });

  it('deletes the report after a confirmation and returns to the reports page', async () => {
    const fetchMock = stubServer(flagsOn, alice, {
      [`/api/reports/${id}?version=1`]: firstVersion,
      '/api/reports': () => Response.json([]),
    });
    const { router } = renderAt(`/reports/${id}?version=1`);
    const user = userEvent.setup();
    const entries = router.history.length;

    await user.click(await screen.findByRole('button', { name: 'Delete report' }));
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/reports'));
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}`, { method: 'DELETE' });
    expect(await screen.findByText(/no saved reports yet/)).toBeInTheDocument();
    // Replaced, so Back does not reopen the deleted report.
    expect(router.history.length).toBe(entries);
  });

  it('stays on the report and says why when the delete fails', async () => {
    const fetchMock = stubServer(flagsOn, alice, {
      [`/api/reports/${id}`]: () => Response.json(owned),
    });
    const { router } = renderAt(`/reports/${id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete report' }));
    fetchMock.mockImplementationOnce(async () => notFound());
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be deleted.');
    expect(router.state.location.pathname).toBe(`/reports/${id}`);
  });
});

describe('/s/:shareId old data', () => {
  viewOnNovember1();

  it('suggests signing in or a new report instead of a refresh', async () => {
    stubServer(flagsOn, null, { '/api/s/abc': () => Response.json(shared) });
    renderAt('/s/abc');

    const warning = await screen.findByRole('note', { name: 'Old data' });
    expect(within(warning).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin',
    );
    expect(within(warning).getByRole('link', { name: 'Run a new report' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('does not suggest signing in to someone already signed in', async () => {
    stubServer(flagsOn, alice, { '/api/s/abc': () => Response.json(shared) });
    renderAt('/s/abc');

    const warning = await screen.findByRole('note', { name: 'Old data' });
    await screen.findByRole('button', { name: 'Account menu for Alice' });
    expect(within(warning).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(within(warning).getByRole('link', { name: 'Run a new report' })).toBeInTheDocument();
  });

  it('only suggests a new report while sign-in does not exist', async () => {
    stubServer({ enabled: ['report-links'], signIn: false }, null, {
      '/api/s/abc': () => Response.json(shared),
    });
    renderAt('/s/abc');

    const warning = await screen.findByRole('note', { name: 'Old data' });
    expect(within(warning).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(within(warning).getByRole('link', { name: 'Run a new report' })).toBeInTheDocument();
  });
});
