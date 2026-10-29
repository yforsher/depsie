import type { ReportRequest } from 'shared';
import * as z from 'zod';
import { chatJson } from './openrouter.js';

export const MAX_CANDIDATES = 5;
const REGISTRY = 'https://registry.npmjs.org';

export interface Candidate {
  name: string;
  version: string;
}

const expansionSchema = z.object({
  keywords: z.array(z.string()),
  packages: z.array(z.string()),
});

const SYSTEM_PROMPT = `You help a developer find npm packages for a need.
Return up to 3 short npm search keyword phrases and up to ${MAX_CANDIDATES} npm package names that
directly address the need, most suitable first. Only name packages you know exist on npm.
If the developer's current dependencies are listed, prefer packages that fit alongside them.`;

function userPrompt({ need, framework, dependencies }: ReportRequest): string {
  const lines = [`Need: ${need}`, `Framework: ${framework}`];
  if (dependencies?.length) {
    lines.push('Current dependencies:', ...dependencies.map((d) => `- ${d.name}@${d.range}`));
  }
  return lines.join('\n');
}

const TIMEOUT_MS = 10_000;

// Without candidates there is no report, so unlike the package data sources an npm failure fails
// the request; the report endpoint maps it to 502.
export class NpmError extends Error {}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
    (error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NpmError(`The npm registry did not answer within ${TIMEOUT_MS / 1000}s`);
      }
      throw error;
    },
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new NpmError(`npm registry request failed with status ${res.status}: ${url}`);
  return res.json();
}

// Unknown names (the model may suggest packages that do not exist) resolve to undefined.
async function resolveLatest(name: string): Promise<Candidate | undefined> {
  const doc = (await fetchJson(`${REGISTRY}/${name}/latest`)) as Candidate | undefined;
  return doc && { name: doc.name, version: doc.version };
}

async function search(keywords: string): Promise<Candidate[]> {
  const url = `${REGISTRY}/-/v1/search?text=${encodeURIComponent(keywords)}&size=${MAX_CANDIDATES}`;
  const data = (await fetchJson(url)) as { objects: { package: Candidate }[] };
  return data.objects.map(({ package: { name, version } }) => ({ name, version }));
}

// Model-named packages come first because they target the need directly; search results
// fill the remaining slots and catch packages newer than the model's training data.
export async function findCandidates(
  request: ReportRequest,
  signal: AbortSignal,
): Promise<Candidate[]> {
  const { keywords, packages } = await chatJson(
    'query_expansion',
    expansionSchema,
    SYSTEM_PROMPT,
    userPrompt(request),
    signal,
  );
  const [named, searched] = await Promise.all([
    Promise.all(packages.slice(0, MAX_CANDIDATES).map(resolveLatest)),
    Promise.all(keywords.slice(0, 3).map(search)),
  ]);

  const byName = new Map<string, Candidate>();
  for (const candidate of [...named, ...searched.flat()]) {
    if (candidate && !byName.has(candidate.name)) byName.set(candidate.name, candidate);
  }
  return [...byName.values()].slice(0, MAX_CANDIDATES);
}
