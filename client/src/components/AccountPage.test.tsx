import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alice, calledUrls, renderAt, stubServer } from '../testRouter.tsx';

const accountsOn = { enabled: ['accounts' as const], signIn: true };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/account', () => {
  it("shows the signed-in user's profile", async () => {
    stubServer(accountsOn, alice);
    renderAt('/account');

    const page = await screen.findByRole('main');
    await waitFor(() => expect(page).toHaveTextContent('alice@example.com'));
    expect(page).toHaveTextContent('Alice');
    expect(page).toHaveTextContent('@alice');
  });

  it('deletes the account after a confirmation, then shows the anonymous app', async () => {
    const fetchMock = stubServer(accountsOn, alice);
    renderAt('/account');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(calledUrls(fetchMock).some((url) => url.endsWith('/api/auth/delete-user'))).toBe(false);
    expect(screen.getByRole('main')).toHaveTextContent(
      'This deletes your account and everything stored with it.',
    );
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() =>
      expect(calledUrls(fetchMock).some((url) => url.endsWith('/api/auth/delete-user'))).toBe(true),
    );
    expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
  });

  it('asks to sign in again when the session is too old to delete the account', async () => {
    stubServer(accountsOn, alice, {
      '/api/auth/delete-user': () =>
        Response.json(
          {
            code: 'SESSION_EXPIRED',
            message: 'Session expired. Re-authenticate to perform this action.',
          },
          { status: 400 },
        ),
    });
    renderAt('/account');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'For your safety, sign out and sign in again, then delete your account.',
    );
  });

  it("shows the user's avatar and that the account comes from GitHub", async () => {
    stubServer(accountsOn, alice);
    renderAt('/account');

    expect(await screen.findByRole('img', { name: 'Alice' })).toHaveAttribute('src', alice.image);
    expect(screen.getByRole('main')).toHaveTextContent('Signed in with GitHub');
  });

  // Intended change: /account is no longer shown to visitors who are not signed in.
  it('sends a visitor who is not signed in to the sign-in page', async () => {
    stubServer(accountsOn, null);
    const { router } = renderAt('/account');

    expect(await screen.findByRole('heading', { name: 'Sign in to Depsie' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('sends visitors home while sign-in does not exist', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    const { router } = renderAt('/account');

    expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });
});
