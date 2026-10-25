import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

// Recorded real responses, trimmed: @hookform/resolvers@6.0.0 for every source except OSV,
// which is lodash@4.17.20 so the fixture has known vulnerabilities.
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const routes: [string, string][] = [
  ['https://registry.npmjs.org/', 'npm'],
  ['https://api.npmjs.org/downloads/', 'downloads'],
  ['https://api.deps.dev/v3/systems/', 'dependencies'],
  ['https://api.deps.dev/v3/projects/', 'project'],
  ['https://api.osv.dev/', 'osv'],
  ['https://api.github.com/', 'github'],
  ['https://cdn.jsdelivr.net/npm/', 'readme'],
];

export const JSDELIVR_README = '# Resolvers\n\nREADME from the published package files.';

// Serves each source's fixture by URL; sources listed in `failing` return status 500, and
// `overrides` replaces a source's JSON body.
export function mockSources(failing: string[] = [], overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) throw new Error(`No fixture for ${url}`);
    const [, source] = route;
    if (failing.includes(source)) return new Response('error', { status: 500 });
    if (source === 'readme') return new Response(JSDELIVR_README);
    return Response.json(overrides[source] ?? fixture(source));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
