import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  type RouterHistory,
  useSearch,
} from '@tanstack/react-router';
import { App } from './App.tsx';
import { useMe } from './account.ts';
import { AccountMenu } from './components/AccountMenu.tsx';
import { AccountPage } from './components/AccountPage.tsx';
import { SignInPage } from './components/SignInPage.tsx';
import { useFeaturesSettled, useSignIn } from './features.ts';

// Every page shares the top bar: the Depsie logo, which leads home, and the account control.
const rootRoute = createRootRoute({
  component: () => (
    <>
      <header className="site-bar">
        <Link to="/" className="brand" aria-label="Depsie home">
          <img src="/logo.svg" alt="" />
          Depsie
        </Link>
        <AccountMenu />
      </header>
      <Outlet />
    </>
  ),
  // A mistyped or old address goes home, replacing it in the history so Back does not return to it.
  notFoundComponent: () => <Navigate to="/" replace />,
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: App });

// The sign-in page by URL while sign-in exists; otherwise home, as if the page did not exist.
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  // Better Auth sends a sign-in that did not complete back here with ?error=<code>.
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: function SignIn() {
    const settled = useFeaturesSettled();
    const signIn = useSignIn();
    const { error } = useSearch({ from: '/signin' });
    if (!settled) return null;
    return signIn ? <SignInPage failed={!!error} /> : <Navigate to="/" replace />;
  },
});

// The signed-in user's page. Anyone else goes to the sign-in page while sign-in exists, else home.
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: function Account() {
    const settled = useFeaturesSettled();
    const signIn = useSignIn();
    const me = useMe();
    // Wait for the flags and the user, so a signed-in user is never sent away by mistake.
    if (!settled || me.isLoading) return null;
    if (me.data) return <AccountPage me={me.data} />;
    return <Navigate to={signIn ? '/signin' : '/'} replace />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, signInRoute, accountRoute]);

// Tests pass a memory history; the app uses the browser's.
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
