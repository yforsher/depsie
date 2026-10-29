import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockSources } from './fixtures.js';
import {
  fetchDependencyCount,
  fetchGithub,
  fetchNpm,
  fetchProject,
  fetchVulnerabilities,
  fetchWeeklyDownloads,
  parseGithubRepo,
} from './sources.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fetchNpm', () => {
  it('reads version-specific metadata, release activity and the README', async () => {
    mockSources();
    const data = await fetchNpm('@hookform/resolvers', '6.0.0', new Date('2026-10-25T00:00:00Z'));
    expect(data).toEqual({
      description: expect.stringContaining('React Hook Form validation resolvers'),
      license: 'MIT',
      maintainers: ['bluebill1049', 'kotarella1110', 'jorisre'],
      directDependencies: 1,
      peerDependencies: { 'react-hook-form': '^7.55.0' },
      types: 'dist/index.d.ts',
      unpackedSize: 1179806,
      deprecated: null,
      firstReleaseDate: '2020-05-20T11:33:35.328Z',
      versionReleaseDate: '2026-10-19T05:35:47.214Z',
      releasesLastYear: 3,
      readme: expect.stringContaining('React Hook Form'),
      githubRepo: 'react-hook-form/resolvers',
    });
  });

  it('counts only releases within a year of now', async () => {
    mockSources();
    const data = await fetchNpm('@hookform/resolvers', '6.0.0', new Date('2027-09-01T00:00:00Z'));
    expect(data.releasesLastYear).toBe(2);
  });

  it('fails when the version is not in the metadata', async () => {
    mockSources();
    await expect(fetchNpm('@hookform/resolvers', '9.9.9', new Date())).rejects.toThrow(
      'Version 9.9.9 not found',
    );
  });
});

describe('parseGithubRepo', () => {
  it.each([
    ['git+https://github.com/react-hook-form/resolvers.git', 'react-hook-form/resolvers'],
    ['https://github.com/colinhacks/zod', 'colinhacks/zod'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['https://github.com/owner/monorepo/tree/main/packages/a', 'owner/monorepo'],
  ])('reads %s', (url, repo) => {
    expect(parseGithubRepo({ url })).toBe(repo);
    expect(parseGithubRepo(url)).toBe(repo);
  });

  it('returns null for other hosts or no repository', () => {
    expect(parseGithubRepo({ url: 'https://gitlab.com/owner/repo.git' })).toBeNull();
    expect(parseGithubRepo(undefined)).toBeNull();
  });
});

describe('other fetchers', () => {
  it('reads weekly downloads', async () => {
    mockSources();
    await expect(fetchWeeklyDownloads('@hookform/resolvers')).resolves.toBe(28043003);
  });

  it('counts dependencies in the graph without the package itself', async () => {
    const fetchMock = mockSources();
    await expect(fetchDependencyCount('@hookform/resolvers', '6.0.0')).resolves.toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.deps.dev/v3/systems/npm/packages/%40hookform%2Fresolvers/versions/6.0.0:dependencies',
    );
  });

  it('reads issues and the scorecard', async () => {
    mockSources();
    await expect(fetchProject('react-hook-form/resolvers')).resolves.toEqual({
      openIssues: 0,
      scorecardScore: 5.3,
      scorecardDate: '2026-08-24T00:00:00Z',
    });
  });

  it('reads known vulnerabilities', async () => {
    mockSources();
    const vulns = await fetchVulnerabilities('lodash', '4.17.20');
    expect(vulns[0]).toEqual({
      id: 'GHSA-29mw-wpgm-hmr9',
      summary: 'Regular Expression Denial of Service (ReDoS) in lodash',
      severity: 'MODERATE',
      aliases: ['CVE-2020-28500'],
    });
  });

  it('returns no vulnerabilities for an empty OSV response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    );
    await expect(fetchVulnerabilities('zod', '4.6.7')).resolves.toEqual([]);
  });

  it('reads stars, the last push and archived flag, sending the token when set', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    const fetchMock = mockSources();
    await expect(fetchGithub('react-hook-form/resolvers')).resolves.toEqual({
      stars: 2265,
      lastPush: '2026-10-24T22:51:50Z',
      archived: false,
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer test-token' },
    });
  });
});
