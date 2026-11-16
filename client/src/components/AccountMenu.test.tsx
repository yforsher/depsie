import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alice, calledUrls, renderAt, stubServer } from '../testRouter.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account menu', () => {
  it('shows Sign in when accounts is on and nobody is signed in', async () => {
    stubServer({ enabled: ['accounts'], signIn: true }, null);
    renderAt('/');

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });

  it('shows the avatar with Account and Sign out when signed in', async () => {
    stubServer({ enabled: ['accounts'], signIn: true }, alice);
    renderAt('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Account menu for Alice' }));

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('signs out on the server from the menu', async () => {
    const fetchMock = stubServer({ enabled: ['accounts'], signIn: true }, alice);
    renderAt('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Account menu for Alice' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(calledUrls(fetchMock).some((url) => url.endsWith('/api/auth/sign-out'))).toBe(true),
    );
  });

  it.each([
    ['off', { enabled: [], signIn: false }],
    ['a list without this visitor', { enabled: [], signIn: true }],
  ] as const)(
    'shows no sign-in UI and asks for no user while accounts is %s',
    async (_, features) => {
      const fetchMock = stubServer({ ...features, enabled: [...features.enabled] }, null);
      renderAt('/');

      await screen.findByLabelText('What do you need?');
      await waitFor(() =>
        expect(calledUrls(fetchMock).some((url) => url.endsWith('/api/features'))).toBe(true),
      );
      expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(calledUrls(fetchMock).some((url) => url.endsWith('/api/me'))).toBe(false);
    },
  );
});
