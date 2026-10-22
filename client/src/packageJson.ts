import validRange from 'semver/ranges/valid';
import type { Dependency } from 'shared';
import allowlist from './allowlist.json';

export type SkipReason = 'scope-not-allowed' | 'non-registry';

export interface SkippedDependency extends Dependency {
  reason: SkipReason;
}

export interface FilterResult {
  sent: Dependency[];
  skipped: SkippedDependency[];
}

const distTag = /^[a-z][a-z0-9._-]*$/i;

/** Reads dependencies and devDependencies. Throws SyntaxError on invalid JSON. */
export function parsePackageJson(text: string): Dependency[] {
  const manifest = JSON.parse(text);
  // Merging also removes a name listed in both sections.
  const merged = { ...manifest?.dependencies, ...manifest?.devDependencies };
  return Object.entries(merged)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, range]) => ({ name, range }));
}

/** "@acme, foo" becomes ["@acme", "@foo"]. */
export function parseScopes(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((scope) => (scope.startsWith('@') ? scope : `@${scope}`));
}

export function filterDependencies(deps: Dependency[], extraScopes: string[] = []): FilterResult {
  const allowedScopes = new Set([...allowlist, ...extraScopes]);
  const result: FilterResult = { sent: [], skipped: [] };

  for (const dep of deps) {
    const scope = dep.name.startsWith('@') ? dep.name.split('/')[0]! : null;
    if (scope && !allowedScopes.has(scope)) {
      result.skipped.push({ ...dep, reason: 'scope-not-allowed' });
    } else if (!isRegistryRange(dep.range)) {
      // git, file, link, workspace and URL specs can reveal internal hosts and paths.
      result.skipped.push({ ...dep, reason: 'non-registry' });
    } else {
      result.sent.push(dep);
    }
  }
  return result;
}

function isRegistryRange(range: string): boolean {
  return validRange(range) !== null || distTag.test(range);
}
