import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFeature } from './features';

function AccountsButton() {
  return useFeature('accounts') ? <button>Sign in</button> : null;
}

function mockFeatures(response: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderButton() {
  // No retries, so a failed call settles at once.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccountsButton />
    </QueryClientProvider>,
  );
  return client;
}

// Waits until the features call has finished, so a hidden button is the answer and not the
// loading state.
async function settled(client: QueryClient, status: 'success' | 'error') {
  await vi.waitFor(() => expect(client.getQueryState(['features'])?.status).toBe(status));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFeature', () => {
  it('shows the UI when the server lists the flag', async () => {
    const fetchMock = mockFeatures(async () => Response.json({ enabled: ['accounts'] }));

    renderButton();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/features');
  });

  it('hides the UI when the server does not list the flag', async () => {
    mockFeatures(async () => Response.json({ enabled: ['report-links'] }));

    await settled(renderButton(), 'success');

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('hides the UI while the list is loading', () => {
    mockFeatures(() => new Promise(() => {}));

    renderButton();

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('hides the UI when the call fails', async () => {
    mockFeatures(async () => new Response('error', { status: 500 }));

    await settled(renderButton(), 'error');

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
