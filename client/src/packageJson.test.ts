import { describe, expect, it } from 'vitest';
import { filterDependencies, parsePackageJson, parseScopes } from './packageJson';

describe('parsePackageJson', () => {
  it('reads dependencies and devDependencies', () => {
    const text = JSON.stringify({
      name: 'private-app',
      dependencies: { react: '^19.0.0' },
      devDependencies: { vitest: '~5.0.0' },
      scripts: { build: 'vite build' },
    });

    expect(parsePackageJson(text)).toEqual([
      { name: 'react', range: '^19.0.0' },
      { name: 'vitest', range: '~5.0.0' },
    ]);
  });

  it('lists a package found in both sections once', () => {
    const text = JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { react: '^19.0.0' },
    });

    expect(parsePackageJson(text)).toEqual([{ name: 'react', range: '^19.0.0' }]);
  });

  it('returns nothing when there are no dependency sections', () => {
    expect(parsePackageJson('{"name": "x"}')).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePackageJson('{ not json')).toThrow(SyntaxError);
  });
});

describe('parseScopes', () => {
  it('splits on commas and spaces and adds the @ prefix', () => {
    expect(parseScopes('@acme, foo  bar')).toEqual(['@acme', '@foo', '@bar']);
  });
});

describe('filterDependencies', () => {
  it('sends unscoped registry packages', () => {
    const result = filterDependencies([{ name: 'react', range: '^19.0.0' }]);

    expect(result.sent).toEqual([{ name: 'react', range: '^19.0.0' }]);
    expect(result.skipped).toEqual([]);
  });

  it('sends scoped packages whose scope is in the allowlist', () => {
    const result = filterDependencies([{ name: '@tanstack/react-query', range: '^5.0.0' }]);

    expect(result.sent).toHaveLength(1);
  });

  it('skips scoped packages whose scope is not allowed', () => {
    const result = filterDependencies([{ name: '@acme/internal-ui', range: '^1.0.0' }]);

    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual([
      { name: '@acme/internal-ui', range: '^1.0.0', reason: 'scope-not-allowed' },
    ]);
  });

  it('sends scoped packages whose scope was added in settings', () => {
    const result = filterDependencies([{ name: '@acme/internal-ui', range: '^1.0.0' }], ['@acme']);

    expect(result.sent).toHaveLength(1);
  });

  it.each(['^1.2.3', '~1.2.0', '1.x', '>=2 <3', '*', '1.2.3', 'latest', 'next'])(
    'sends the registry range %s',
    (range) => {
      expect(filterDependencies([{ name: 'pkg', range }]).sent).toHaveLength(1);
    },
  );

  it.each([
    'git+ssh://git@git.internal.example:team/pkg.git',
    'git://github.com/user/pkg.git',
    'github:user/pkg',
    'file:../local-pkg',
    'link:../local-pkg',
    'workspace:*',
    'https://packages.internal.example/pkg.tgz',
    'http://10.0.0.5/pkg.tgz',
    'user/repo',
  ])('skips the non-registry range %s', (range) => {
    const result = filterDependencies([{ name: 'pkg', range }]);

    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual([{ name: 'pkg', range, reason: 'non-registry' }]);
  });
});
