import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { Me } from 'shared';
import { authClient } from '../account';

// Better Auth asks for a recent sign-in before deleting an account.
const SESSION_EXPIRED = 'SESSION_EXPIRED';

export function AccountPage({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function deleteAccount() {
    const { error } = await authClient.deleteUser();
    if (error) {
      setError(
        error.code === SESSION_EXPIRED
          ? 'For your safety, sign out and sign in again, then delete your account.'
          : 'Your account could not be deleted. Please try again.',
      );
      return;
    }
    await queryClient.invalidateQueries();
    await navigate({ to: '/' });
  }

  return (
    <main className="narrow">
      <section className="panel stack">
        <h1>Account</h1>
        <div className="profile">
          {me.image && <img className="profile-avatar" src={me.image} alt={me.name} />}
          <div>
            <p className="profile-name">{me.name}</p>
            <p className="hint">@{me.login}</p>
            <p className="hint">{me.email}</p>
          </div>
        </div>
        <p className="hint">
          Signed in with GitHub. Depsie keeps your name, login, avatar and email, and no GitHub
          token.
        </p>
      </section>
      <section className="panel stack" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete account</h2>
        {confirming ? (
          <>
            <p>This deletes your account and everything stored with it. It cannot be undone.</p>
            <div className="page-links">
              <button type="button" className="danger-button" onClick={deleteAccount}>
                Delete permanently
              </button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Removes your account and everything stored with it.</p>
            <button
              type="button"
              className="danger-outline-button"
              onClick={() => setConfirming(true)}
            >
              Delete account
            </button>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
