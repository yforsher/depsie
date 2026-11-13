import { vi } from 'vitest';
import { sourceResponse } from './fixtureResponses.js';

export * from './fixtureResponses.js';

export function mockSources(failing: string[] = [], overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => sourceResponse(url, failing, overrides));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
