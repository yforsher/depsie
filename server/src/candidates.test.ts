import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCandidates } from './candidates.js';
import { usage } from './fixtures.js';

const request = { need: 'validate forms', framework: 'React' as const };
const signal = new AbortController().signal;

// Routes each fetch by URL: OpenRouter returns the given expansion, /latest returns the
// version for known packages (404 otherwise), and search returns the hits for its keywords.
function mockFetch(
  expansion: { keywords: string[]; packages: string[] },
  latest: Record<string, string>,
  searchHits: Record<string, string[]> = {},
) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('https://openrouter.ai')) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify(expansion) } }],
        usage,
      });
    }
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/-/v1/search') {
      const names = searchHits[searchParams.get('text') ?? ''] ?? [];
      return Response.json({
        objects: names.map((name) => ({ package: { name, version: '1.0.0' } })),
      });
    }
    const name = pathname.slice(1, -'/latest'.length);
    if (!latest[name]) return Response.json('Not Found', { status: 404 });
    return Response.json({ name, version: latest[name] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findCandidates', () => {
  it('resolves model-named packages to their latest versions', async () => {
    mockFetch(
      { keywords: [], packages: ['react-hook-form', '@hookform/resolvers'] },
      { 'react-hook-form': '7.60.0', '@hookform/resolvers': '6.0.0' },
    );
    await expect(findCandidates(request, signal)).resolves.toEqual([
      { name: 'react-hook-form', version: '7.60.0' },
      { name: '@hookform/resolvers', version: '6.0.0' },
    ]);
  });

  it('drops package names that do not exist on npm', async () => {
    mockFetch({ keywords: [], packages: ['formik', 'made-up-package'] }, { formik: '2.4.6' });
    await expect(findCandidates(request, signal)).resolves.toEqual([
      { name: 'formik', version: '2.4.6' },
    ]);
  });

  it('fills remaining slots from search results without duplicates', async () => {
    mockFetch(
      { keywords: ['react form'], packages: ['formik'] },
      { formik: '2.4.6' },
      { 'react form': ['formik', 'react-final-form'] },
    );
    await expect(findCandidates(request, signal)).resolves.toEqual([
      { name: 'formik', version: '2.4.6' },
      { name: 'react-final-form', version: '1.0.0' },
    ]);
  });

  it('returns at most 5 candidates', async () => {
    const packages = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    mockFetch(
      { keywords: ['forms'], packages },
      Object.fromEntries(packages.map((name) => [name, '1.0.0'])),
      { forms: ['h', 'i'] },
    );
    const candidates = await findCandidates(request, signal);
    expect(candidates.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('includes dependencies in the prompt', async () => {
    const fetchMock = mockFetch({ keywords: [], packages: [] }, {});
    await findCandidates(
      { ...request, dependencies: [{ name: 'react', range: '^19.0.0' }] },
      signal,
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.messages[1].content).toContain('- react@^19.0.0');
  });
});
