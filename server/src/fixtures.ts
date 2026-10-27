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

// Token counts and cost as OpenRouter reports them on every response.
export const usage = { prompt_tokens: 166, completion_tokens: 267, cost: 0.00005304 };

export const JSDELIVR_README = '# Resolvers\n\nREADME from the published package files.';

// Serves each source's fixture by URL; sources listed in `failing` return status 500, and
// `overrides` replaces a source's JSON body.
export function sourceResponse(
  url: string,
  failing: string[] = [],
  overrides: Record<string, unknown> = {},
): Response {
  const route = routes.find(([prefix]) => url.startsWith(prefix));
  if (!route) throw new Error(`No fixture for ${url}`);
  const [, source] = route;
  if (failing.includes(source)) return new Response('error', { status: 500 });
  if (source === 'readme') return new Response(JSDELIVR_README);
  return Response.json(overrides[source] ?? fixture(source));
}

export function mockSources(failing: string[] = [], overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => sourceResponse(url, failing, overrides));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const NAME = '@hookform/resolvers';

export function claim(field: string, pkg = NAME) {
  return { text: `About ${field}.`, evidence: [{ package: pkg, field }] };
}

function check(field: string) {
  return { status: 'ok', ...claim(field) };
}

// A valid AI call 2 answer for the fixture package; `overrides` replaces top-level keys.
export function comparison(overrides: Record<string, unknown> = {}) {
  return {
    ranking: [{ name: NAME, reasons: [claim('downloads.weekly')] }],
    rejected: [],
    security: [
      {
        name: NAME,
        license: check('npm.license'),
        vulnerabilities: check('vulnerabilities.known'),
        maintainers: check('npm.maintainers'),
        dependencyCount: check('dependencies.total'),
        releaseActivity: check('npm.versionReleaseDate'),
      },
    ],
    ...overrides,
  };
}
