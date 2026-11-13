import { readFileSync } from 'node:fs';

// Recorded real responses, trimmed: @hookform/resolvers@6.0.0 for every source except OSV,
// which is lodash@4.17.20 so the fixture has known vulnerabilities. No Vitest here, so the e2e
// server (e2e.ts) can use it too.
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

const NAME = '@hookform/resolvers';

export function claim(field: string, pkg = NAME) {
  return { text: `About ${field}.`, evidence: [{ package: pkg, field }] };
}

// A valid AI call 2 answer for the fixture package; `overrides` replaces top-level keys.
export function comparison(overrides: Record<string, unknown> = {}) {
  return {
    ranking: [{ name: NAME, pros: [claim('downloads.weekly')], cons: [] }],
    rejected: [],
    summary: claim('npm.description'),
    security: [
      {
        name: NAME,
        license: 'ok',
        dependencyCount: 'ok',
        releaseActivity: 'warning',
      },
    ],
    ...overrides,
  };
}

// AI call 1 names only the fixture package and no keywords, so there is no npm search.
const expansion = { keywords: [], packages: [NAME] };

// A whole report from fixtures: each AI call is answered by the schema name it asks for, npm
// /latest resolves the fixture package, and every other source is served from the fixtures.
export async function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  if (url.startsWith('https://openrouter.ai')) {
    const { response_format } = JSON.parse(init!.body as string) as {
      response_format: { json_schema: { name: string } };
    };
    const answer =
      response_format.json_schema.name === 'query_expansion' ? expansion : comparison();
    const content = JSON.stringify(answer);
    return Response.json({ provider: 'fixtures', choices: [{ message: { content } }], usage });
  }
  if (url.endsWith('/latest')) return Response.json({ name: NAME, version: '6.0.0' });
  return sourceResponse(url);
}
