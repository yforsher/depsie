import { afterEach, describe, expect, it, vi } from 'vitest';
import { claim, comparison, mockSources } from './fixtures.js';
import { fetchPackageData, type PackageData } from './packageData.js';
import { AiError } from './openrouter.js';
import { compareCandidates } from './report.js';

const request = { need: 'validate forms', framework: 'React' as const };
const NAME = '@hookform/resolvers';

async function packages(failing: string[] = []): Promise<PackageData[]> {
  mockSources(failing);
  return [await fetchPackageData({ name: NAME, version: '6.0.0' })];
}

function mockOpenRouter(content: unknown) {
  const fetchMock = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compareCandidates', () => {
  it('fills in versions, ranks, sources, pages and fetch dates from the fetched data', async () => {
    const data = await packages();
    mockOpenRouter(comparison());
    const report = await compareCandidates(request, data);

    expect(report.ranking).toEqual([
      {
        rank: 1,
        name: NAME,
        version: '6.0.0',
        reasons: [
          {
            text: 'About downloads.weekly.',
            evidence: [
              {
                package: NAME,
                field: 'downloads.weekly',
                source: 'npm downloads',
                url: 'https://www.npmjs.com/package/@hookform/resolvers/v/6.0.0',
                fetchedAt: data[0].downloads.fetchedAt,
              },
            ],
          },
        ],
      },
    ]);
    expect(report.security[0].license).toMatchObject({
      status: 'ok',
      evidence: [{ field: 'npm.license', source: 'npm registry' }],
    });
    expect(report.sources).toHaveLength(7);
    expect(report.sources).toContainEqual({
      name: `OSV for ${NAME}@6.0.0`,
      url: 'https://osv.dev/list?ecosystem=npm&q=%40hookform%2Fresolvers',
      fetchedAt: data[0].vulnerabilities.fetchedAt,
    });
  });

  it('sends only the fetched data, with the README shortened', async () => {
    const data = await packages();
    const readme = data[0].readme;
    if ('data' in readme) readme.data.text = 'x'.repeat(10_000);
    const fetchMock = mockOpenRouter(comparison());
    await compareCandidates(request, data);

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    const sent = JSON.parse(body.messages[1].content.split('Packages:\n')[1]);
    expect(sent[0].readme.text).toHaveLength(4000);
    expect(sent[0].npm.license).toBe('MIT');
    expect(sent[0].npm).not.toHaveProperty('source');
  });

  it('rejects a reference to a field that was not fetched', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ ranking: [{ name: NAME, reasons: [claim('npm.stars')] }] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(
      `Model cited data that was not fetched: field ${NAME} npm.stars`,
    );
  });

  it('rejects a reference to another package', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, reasons: [claim('npm.license', 'formik')] }] }),
    );
    await expect(compareCandidates(request, data)).rejects.toThrow(/field formik npm.license/);
  });

  it('rejects a package name that was not fetched', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ rejected: [{ name: '...', reasons: [claim('npm.license')] }] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(
      'Model cited data that was not fetched: package ...',
    );
  });

  it('lists every invalid reference and keeps the raw model output', async () => {
    const data = await packages();
    const answer = comparison({
      ranking: [{ name: NAME, reasons: [claim('npm...'), claim('npm.stars')] }],
      rejected: [{ name: '...', reasons: [claim('npm.license')] }],
    });
    mockOpenRouter(answer);
    const error = await compareCandidates(request, data).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).message).toBe(
      `Model cited data that was not fetched: package ..., field ${NAME} npm..., field ${NAME} npm.stars`,
    );
    expect(JSON.parse((error as AiError).modelOutput!)).toEqual(answer);
  });

  it('accepts the reason for an unavailable source but not its data fields', async () => {
    const data = await packages(['github']);
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, reasons: [claim('github.unavailable')] }] }),
    );
    const report = await compareCandidates(request, data);
    expect(report.ranking[0].reasons[0].evidence[0]).toMatchObject({ source: 'GitHub' });

    mockOpenRouter(comparison({ ranking: [{ name: NAME, reasons: [claim('github.lastPush')] }] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(/github.lastPush/);
  });

  it('rejects a claim without evidence', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, reasons: [{ text: 'Popular.', evidence: [] }] }] }),
    );
    await expect(compareCandidates(request, data)).rejects.toThrow(/does not match the schema/);
  });

  it('rejects an answer that leaves out a fetched package', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ ranking: [], security: [] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(
      `Model output is incomplete: ${NAME} is neither ranked nor rejected, ${NAME} has no security summary`,
    );
  });

  it('rejects a package that is both ranked and rejected', async () => {
    const data = await packages();
    const entry = { name: NAME, reasons: [claim('npm.license')] };
    mockOpenRouter(comparison({ ranking: [entry], rejected: [entry] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(`${NAME} is listed 2 times`);
  });

  it('rejects a ranked package without reasons', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ ranking: [{ name: NAME, reasons: [] }] }));
    await expect(compareCandidates(request, data)).rejects.toThrow(/does not match the schema/);
  });
});
