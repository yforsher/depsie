import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createAppRouter } from './router.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('shows the report form at /', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ enabled: [], signIn: false })),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
});

it.each(['/', '/signin', '/account'])(
  'links the Depsie logo to the home page on %s',
  async (path) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ enabled: [], signIn: true })),
    );
    const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Depsie home' })).toHaveAttribute('href', '/');
  },
);

it('sends an unknown path home', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ enabled: [], signIn: false })),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/accou'] }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/');
});
