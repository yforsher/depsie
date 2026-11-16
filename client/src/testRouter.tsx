import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { FeaturesResponse, Me } from 'shared';
import { vi } from 'vitest';
import { createAppRouter } from './router.tsx';

export const alice: Me = {
  id: 'u1',
  name: 'Alice',
  login: 'alice',
  image: 'https://avatars.example/a.png',
  email: 'alice@example.com',
};

// Answers the server calls the pages make: the flags, and the signed-in user (or null).
// Calls ending with a path in answers get that answer; every other call, Better Auth's included,
// gets an empty JSON answer. All are recorded.
export function stubServer(
  features: FeaturesResponse,
  me: Me | null,
  answers: Record<string, () => Response> = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const answer = Object.entries(answers).find(([path]) => url.endsWith(path));
    if (answer) return answer[1]();
    if (url.endsWith('/api/features')) return Response.json(features);
    if (url.endsWith('/api/me')) return Response.json(me);
    return Response.json({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function calledUrls(fetchMock: ReturnType<typeof stubServer>) {
  return fetchMock.mock.calls.map(([input]) =>
    String(input instanceof Request ? input.url : input),
  );
}

export function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}
