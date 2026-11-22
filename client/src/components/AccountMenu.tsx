import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient, useMe } from '../account';
import { useFeature } from '../features';

export function AccountMenu() {
  const accounts = useFeature('accounts');
  const me = useMe();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  if (!accounts || me.isPending) return null;
  if (!me.data) {
    // Pointless on the sign-in page itself.
    if (pathname === '/signin') return null;
    return (
      <nav className="account-menu">
        <Link to="/signin" className="sign-in-link">
          Sign in
        </Link>
      </nav>
    );
  }

  async function signOut() {
    await authClient.signOut();
    setOpen(false);
    // The flags can depend on the user (a login list), so both are read again.
    await queryClient.invalidateQueries();
  }

  return (
    <nav className="account-menu">
      <button
        type="button"
        className="avatar-button"
        aria-label={`Account menu for ${me.data.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {me.data.image ? <img src={me.data.image} alt="" /> : me.data.name.slice(0, 1)}
      </button>
      {open && (
        <ul className="account-menu-items">
          <li>
            <Link to="/reports" onClick={() => setOpen(false)}>
              Reports
            </Link>
          </li>
          <li>
            <Link to="/usage" onClick={() => setOpen(false)}>
              Usage
            </Link>
          </li>
          <li>
            <Link to="/account" onClick={() => setOpen(false)}>
              Account
            </Link>
          </li>
          <li>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}
