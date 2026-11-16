import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient } from '../account';
import { GitHubMark } from './GitHubMark';
import { PrivacyNote } from './PrivacyNote';

// failed: GitHub sign-in came back without completing (refused, cancelled, or no verified email).
export function SignInPage({ failed }: { failed: boolean }) {
  const [redirecting, setRedirecting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  async function signIn() {
    // One click starts one sign-in; the page then leaves for GitHub.
    setRedirecting(true);
    setStartFailed(false);
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: '/',
      errorCallbackURL: '/signin',
    });
    if (error) {
      setStartFailed(true);
      setRedirecting(false);
    }
  }

  const message = startFailed
    ? 'Sign-in could not start. Please try again.'
    : failed
      ? 'Sign-in with GitHub did not complete. Depsie needs a verified primary email address on your GitHub account. Please try again.'
      : '';

  return (
    <main className="narrow">
      <section className="panel stack">
        <h1>Sign in to Depsie</h1>
        <p>
          Depsie reads your GitHub name, avatar and email address, to show who is signed in and to
          keep your reports private to you.
        </p>
        <p>
          It has no access to your repositories. You can revoke access at any time in your GitHub
          settings, under Applications.
        </p>
        <button type="button" className="github-button" onClick={signIn} disabled={redirecting}>
          <GitHubMark />
          {redirecting ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
        </button>
        {message && (
          <p className="error-text" role="alert">
            {message}
          </p>
        )}
        <div className="page-links">
          <Link to="/">Continue without an account</Link>
          <PrivacyNote />
        </div>
      </section>
    </main>
  );
}
