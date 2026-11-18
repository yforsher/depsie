import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteReport, fetchOwnedReport, fetchReports, refreshReport } from './api';

const id = '00000000-0000-4000-8000-000000000001';

// Answers every call with the given response and records what was asked.
function stubFetch(response: () => Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('report history calls', () => {
  it("lists the user's reports", async () => {
    const fetchMock = stubFetch(() => Response.json([]));
    expect(await fetchReports()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/reports');
  });

  it('reads the latest version, or the one asked for', async () => {
    const fetchMock = stubFetch(() => Response.json({ id }));
    await fetchOwnedReport(id);
    await fetchOwnedReport(id, 2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/reports/${id}`,
      `/api/reports/${id}?version=2`,
    ]);
  });

  it('deletes a report, and says so when it cannot', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await deleteReport(id);
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}`, { method: 'DELETE' });

    stubFetch(() => Response.json({ error: 'Report not found.' }, { status: 404 }));
    await expect(deleteReport(id)).rejects.toThrow('The report could not be deleted.');
  });

  it('refreshes a report and returns its new version', async () => {
    const fetchMock = stubFetch(() => Response.json({ id, version: 2 }));
    expect(await refreshReport(id)).toEqual({ id, version: 2 });
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}/refresh`, { method: 'POST' });
  });

  it.each([
    [429, 'Too many reports: the limit is 10 per hour. Please try again later.'],
    [503, 'Reports are unavailable right now. Please try again later.'],
    [502, 'The AI could not produce a valid report this time. Please try again.'],
  ])('gives a refresh failing with %i the same message as a new report', async (status, text) => {
    const error =
      status === 503
        ? 'Reports are unavailable right now.'
        : 'Too many reports: the limit is 10 per hour.';
    stubFetch(() => Response.json({ error }, { status }));
    await expect(refreshReport(id)).rejects.toThrow(text);
  });
});
