import { afterEach, describe, expect, it, vi } from 'vitest';
import { claim, comparison, mockSources, usage } from './fixtures.js';
import { fetchPackageData, type PackageData } from './packageData.js';
import { AiError } from './openrouter.js';
import { compareCandidates } from './report.js';

const request = { need: 'validate forms', framework: 'React' as const };
const signal = new AbortController().signal;
const NAME = '@hookform/resolvers';

async function packages(failing: string[] = []): Promise<PackageData[]> {
  mockSources(failing);
  return [await fetchPackageData({ name: NAME, version: '6.0.0' })];
}

function mockOpenRouter(content: unknown) {
  const fetchMock = vi.fn(async () =>
    Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage }),
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
    const report = await compareCandidates(request, data, signal);

    expect(report.ranking).toEqual([
      {
        rank: 1,
        name: NAME,
        version: '6.0.0',
        repository: 'https://github.com/react-hook-form/resolvers',
        description:
          'React Hook Form validation resolvers: Yup, Joi, Superstruct, Zod, Vest, Class Validator, io-ts, Nope, computed-types, TypeBox, arktype, Typanion, Effect-TS and VineJS',
        pros: [
          {
            text: 'About downloads.weekly.',
            evidence: [
              {
                package: NAME,
                field: 'downloads.weekly',
                source: 'npm',
                url: 'https://www.npmjs.com/package/@hookform/resolvers/v/6.0.0',
                fetchedAt: data[0].downloads.fetchedAt,
              },
            ],
          },
        ],
        cons: [],
      },
    ]);
    expect(report.summary).toMatchObject({
      text: 'About npm.description.',
      evidence: [{ field: 'npm.description', source: 'npm' }],
    });
    expect(report.security[0].license).toMatchObject({
      status: 'ok',
      evidence: [{ field: 'npm.license', source: 'npm' }],
    });
    expect(report.sources.map((s) => s.name)).toEqual(['npm', 'deps.dev', 'OSV', 'GitHub']);
    expect(report.sources).toContainEqual({
      name: 'OSV',
      url: 'https://osv.dev',
      fetchedAt: data[0].vulnerabilities.fetchedAt,
    });
  });

  it('writes every fact in code and takes only the status from the model', async () => {
    const data = await packages();
    mockOpenRouter(comparison());
    const { security } = await compareCandidates(request, data, signal);

    expect(security[0].license).toEqual({
      text: 'MIT',
      status: 'ok',
      evidence: [expect.objectContaining({ field: 'npm.license', source: 'npm' })],
    });
    expect(security[0].dependencyCount).toMatchObject({
      text: '1',
      status: 'ok',
      evidence: [{ field: 'dependencies.total', source: 'deps.dev' }],
    });
    expect(security[0].releaseActivity).toMatchObject({
      text: '2026-10-19',
      status: 'warning',
      evidence: [{ field: 'npm.versionReleaseDate' }],
    });

    expect(security[0].vulnerabilities).toMatchObject({
      text: '2 known',
      status: 'danger',
      evidence: [{ field: 'vulnerabilities.known', source: 'OSV' }],
    });
    expect(security[0].maintainers).toEqual({
      text: '3',
      evidence: [expect.objectContaining({ field: 'npm.maintainers', source: 'npm' })],
    });
    expect(security[0].weeklyDownloads.text).toBe('28,043,003');
    expect(security[0].stars).toMatchObject({ text: '2,265', evidence: [{ source: 'GitHub' }] });
  });

  it('shows no vulnerabilities as OK and one maintainer by name', async () => {
    const data = await packages();
    const [pkg] = data;
    if ('data' in pkg.vulnerabilities) pkg.vulnerabilities.data.known = [];
    if ('data' in pkg.npm) pkg.npm.data.maintainers = ['zpao'];
    mockOpenRouter(comparison());
    const { security } = await compareCandidates(request, data, signal);

    expect(security[0].vulnerabilities).toMatchObject({ text: '0 known', status: 'ok' });
    expect(security[0].maintainers.text).toBe('zpao');
  });

  it('shows a fact as unavailable when its source failed', async () => {
    const data = await packages(['osv', 'github', 'dependencies']);
    mockOpenRouter(comparison());
    const report = await compareCandidates(request, data, signal);

    expect(report.security[0].vulnerabilities).toEqual({
      text: 'unavailable',
      evidence: [expect.objectContaining({ field: 'vulnerabilities.unavailable' })],
    });
    expect(report.security[0].stars.text).toBe('unavailable');
    // The model's status is dropped: there is no value for it to describe.
    expect(report.security[0].dependencyCount).not.toHaveProperty('status');
    expect(report.sources.map((s) => s.name)).toEqual(['npm', 'deps.dev']);
  });

  it('sends only the fetched data, with the README shortened', async () => {
    const data = await packages();
    const readme = data[0].readme;
    if ('data' in readme) readme.data.text = 'x'.repeat(10_000);
    const fetchMock = mockOpenRouter(comparison());
    await compareCandidates(request, data, signal);

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
    mockOpenRouter(comparison({ ranking: [{ name: NAME, pros: [claim('npm.stars')], cons: [] }] }));
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      `Model cited data that was not fetched: field ${NAME} npm.stars`,
    );
  });

  it('rejects a reference to another package', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, pros: [claim('npm.license', 'formik')], cons: [] }] }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      /field formik npm.license/,
    );
  });

  it('rejects a package name that was not fetched', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({ rejected: [{ name: '...', pros: [], cons: [claim('npm.license')] }] }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      'Model cited data that was not fetched: package ...',
    );
  });

  it('lists every invalid reference and keeps the raw model output', async () => {
    const data = await packages();
    const answer = comparison({
      ranking: [{ name: NAME, pros: [claim('npm...'), claim('npm.stars')], cons: [] }],
      rejected: [{ name: '...', pros: [], cons: [claim('npm.license')] }],
    });
    mockOpenRouter(answer);
    const error = await compareCandidates(request, data, signal).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).message).toBe(
      `Model cited data that was not fetched: package ..., field ${NAME} npm..., field ${NAME} npm.stars`,
    );
    expect(JSON.parse((error as AiError).modelOutput!)).toEqual(answer);
  });

  it('accepts the reason for an unavailable source but not its data fields', async () => {
    const data = await packages(['github']);
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, pros: [claim('github.unavailable')], cons: [] }] }),
    );
    const report = await compareCandidates(request, data, signal);
    expect(report.ranking[0].pros[0].evidence[0]).toMatchObject({ source: 'GitHub' });

    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, pros: [claim('github.lastPush')], cons: [] }] }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(/github.lastPush/);
  });

  it('rejects a claim without evidence', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({
        ranking: [{ name: NAME, pros: [{ text: 'Popular.', evidence: [] }], cons: [] }],
      }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      /does not match the schema/,
    );
  });

  it('rejects an answer that leaves out a fetched package', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ ranking: [], security: [] }));
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      `Model output is incomplete: ${NAME} is neither ranked nor rejected, ${NAME} has no security summary`,
    );
  });

  it('rejects a package that is both ranked and rejected', async () => {
    const data = await packages();
    const entry = { name: NAME, pros: [claim('npm.license')], cons: [claim('npm.license')] };
    mockOpenRouter(comparison({ ranking: [entry], rejected: [entry] }));
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      `${NAME} is listed 2 times`,
    );
  });

  it('rejects a ranked package without a pro and a rejected one without a con', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({ ranking: [{ name: NAME, pros: [], cons: [claim('npm.license')] }] }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      /does not match the schema/,
    );

    mockOpenRouter(
      comparison({
        ranking: [],
        rejected: [{ name: NAME, pros: [claim('npm.license')], cons: [] }],
        summary: null,
      }),
    );
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      /does not match the schema/,
    );
  });

  it('rejects a ranking without a summary, and checks the summary references', async () => {
    const data = await packages();
    mockOpenRouter(comparison({ summary: null }));
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      'Model output is incomplete: no summary for rank 1',
    );

    mockOpenRouter(comparison({ summary: claim('npm.stars') }));
    await expect(compareCandidates(request, data, signal)).rejects.toThrow(
      `field ${NAME} npm.stars`,
    );
  });

  it('accepts no summary when every package is rejected', async () => {
    const data = await packages();
    mockOpenRouter(
      comparison({
        ranking: [],
        rejected: [{ name: NAME, pros: [], cons: [claim('npm.license')] }],
        summary: null,
      }),
    );
    const report = await compareCandidates(request, data, signal);
    expect(report.summary).toBeNull();
    expect(report.rejected[0].cons).toHaveLength(1);
  });
});
