import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calledUrls, renderAt, stubServer } from '../testRouter.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/signin', () => {
  it('explains what is read and offers GitHub sign-in while sign-in exists', async () => {
    stubServer({ enabled: [], signIn: true }, null);
    renderAt('/signin');

    expect(await screen.findByRole('heading', { name: 'Sign in to Depsie' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    const page = screen.getByRole('main');
    expect(page).toHaveTextContent('Depsie reads your GitHub name, avatar and email address');
    expect(page).toHaveTextContent('It has no access to your repositories');
    expect(page).toHaveTextContent('revoke access at any time in your GitHub settings');
    expect(screen.getByRole('button', { name: 'How your data is handled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue without an account' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('starts the GitHub sign-in on the server', async () => {
    const fetchMock = stubServer({ enabled: [], signIn: true }, null);
    renderAt('/signin');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign in with GitHub' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input instanceof Request ? input.url : input).endsWith('/api/auth/sign-in/social'),
      );
      expect(call).toBeDefined();
    });
  });

  it('disables the button after a click, so a second click starts no second sign-in', async () => {
    const fetchMock = stubServer({ enabled: [], signIn: true }, null);
    renderAt('/signin');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign in with GitHub' }));
    const button = screen.getByRole('button', { name: 'Redirecting to GitHub...' });
    expect(button).toBeDisabled();
    await user.click(button);

    await waitFor(() =>
      expect(
        calledUrls(fetchMock).filter((url) => url.endsWith('/api/auth/sign-in/social')),
      ).toHaveLength(1),
    );
  });

  it('says why when GitHub sign-in did not complete', async () => {
    stubServer({ enabled: [], signIn: true }, null);
    renderAt('/signin?error=unable_to_get_user_info');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in with GitHub did not complete. Depsie needs a verified primary email address on your GitHub account.',
    );
  });

  it('turns the button back on and says so when sign-in cannot start', async () => {
    stubServer({ enabled: [], signIn: true }, null, {
      '/api/auth/sign-in/social': () => Response.json({ message: 'Server error' }, { status: 500 }),
    });
    renderAt('/signin');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign in with GitHub' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in could not start. Please try again.',
    );
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
  });

  it('shows no separate Sign in link on the sign-in page', async () => {
    stubServer({ enabled: ['accounts'], signIn: true }, null);
    const { client } = renderAt('/signin');

    // Once the user is known, the menu has decided what to show.
    await waitFor(() => expect(client.getQueryState(['me'])?.status).toBe('success'));
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  // Intended change: redirected home instead of showing the home page at /signin.
  it('sends visitors home while sign-in does not exist', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    const { router } = renderAt('/signin');

    expect(await screen.findByLabelText('What do you need?')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
  });
});

describe('privacy note', () => {
  async function openNote() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'How your data is handled' }));
    return screen.getByRole('dialog', { name: 'How your data is handled' });
  }

  it('says what is stored for the daily cost limits', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    renderAt('/');

    expect(await openNote()).toHaveTextContent(
      'The tokens and cost of each AI call are stored with its day (not the time) to enforce daily cost limits',
    );
  });

  it('describes accounts only while sign-in exists', async () => {
    stubServer({ enabled: [], signIn: false }, null);
    renderAt('/');
    expect(await openNote()).not.toHaveTextContent('Signing in with GitHub');
  });

  it('says what an account stores while sign-in exists', async () => {
    stubServer({ enabled: [], signIn: true }, null);
    renderAt('/');

    await waitFor(async () =>
      expect(await openNote()).toHaveTextContent(
        'Signing in with GitHub stores your GitHub name, login, avatar and email',
      ),
    );
  });
});
