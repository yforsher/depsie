import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, JSDELIVR_README, mockSources } from './fixtures.js';
import { fetchPackageData } from './packageData.js';

const candidate = { name: '@hookform/resolvers', version: '6.0.0' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPackageData README', () => {
  it('uses the npm README and keeps it out of the npm fields', async () => {
    const fetchMock = mockSources();
    const data = await fetchPackageData(candidate);

    expect(data.readme).toMatchObject({
      source: 'npm registry',
      data: { text: expect.stringContaining('React Hook Form') },
    });
    expect(data.npm).not.toHaveProperty('data.readme');
    expect(fetchMock.mock.calls.some(([url]) => url.includes('jsdelivr'))).toBe(false);
  });

  it('falls back to the published README.md on jsDelivr when npm has none', async () => {
    mockSources([], { npm: { ...(fixture('npm') as object), readme: '' } });
    const data = await fetchPackageData(candidate);

    expect(data.readme).toMatchObject({
      source: 'jsDelivr',
      url: 'https://cdn.jsdelivr.net/npm/@hookform/resolvers@6.0.0/README.md',
      data: { text: JSDELIVR_README },
    });
  });

  it('falls back to jsDelivr when npm fails', async () => {
    mockSources(['npm']);
    const data = await fetchPackageData(candidate);
    expect(data.readme).toMatchObject({ source: 'jsDelivr', data: { text: JSDELIVR_README } });
  });

  it('marks the README unavailable when neither source has one', async () => {
    mockSources(['readme'], { npm: { ...(fixture('npm') as object), readme: '' } });
    const data = await fetchPackageData(candidate);
    expect(data.readme).toMatchObject({
      source: 'jsDelivr',
      unavailable: expect.stringContaining('returned status 500'),
    });
  });
});

describe('fetchPackageData', () => {
  it('merges every source with its URL and fetch date', async () => {
    mockSources();
    const data = await fetchPackageData(candidate);

    expect(data).toMatchObject({
      name: '@hookform/resolvers',
      version: '6.0.0',
      npm: {
        source: 'npm registry',
        url: 'https://registry.npmjs.org/@hookform/resolvers',
        data: { license: 'MIT' },
      },
      downloads: { source: 'npm downloads', data: { weekly: 28043003 } },
      dependencies: { source: 'deps.dev', data: { total: 1 } },
      project: {
        source: 'deps.dev',
        url: 'https://api.deps.dev/v3/projects/github.com%2Freact-hook-form%2Fresolvers',
        data: { stars: 2263 },
      },
      vulnerabilities: { source: 'OSV', data: { known: [{ id: 'GHSA-29mw-wpgm-hmr9' }, {}] } },
      github: { source: 'GitHub', data: { archived: false } },
    });
    for (const key of [
      'npm',
      'downloads',
      'dependencies',
      'project',
      'vulnerabilities',
      'github',
    ]) {
      expect(data[key as keyof typeof data]).toHaveProperty('fetchedAt', expect.any(String));
    }
  });

  it('marks a failed source as unavailable and keeps the others', async () => {
    mockSources(['github']);
    const data = await fetchPackageData(candidate);

    expect(data.github).toMatchObject({
      source: 'GitHub',
      unavailable: 'https://api.github.com/repos/react-hook-form/resolvers returned status 500',
    });
    expect(data.github).not.toHaveProperty('data');
    expect(data.project).toHaveProperty('data');
  });

  it('marks repository sources unavailable when npm fails', async () => {
    mockSources(['npm']);
    const data = await fetchPackageData(candidate);

    expect(data.npm).toHaveProperty('unavailable');
    expect(data.project).toMatchObject({ unavailable: 'No GitHub repository in the npm metadata' });
    expect(data.github).toMatchObject({ unavailable: 'No GitHub repository in the npm metadata' });
    expect(data.downloads).toHaveProperty('data');
  });

  it('marks a timeout as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    );
    const data = await fetchPackageData(candidate);

    expect(data.downloads).toMatchObject({
      unavailable: 'The operation was aborted due to timeout',
    });
  });
});
