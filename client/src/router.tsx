import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  type RouterHistory,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { App } from './App.tsx';
import { useMe } from './account.ts';
import { AccountMenu } from './components/AccountMenu.tsx';
import { AccountPage } from './components/AccountPage.tsx';
import { ReportsPage } from './components/ReportsPage.tsx';
import { SavedReportPage } from './components/SavedReportPage.tsx';
import { SharedReportPage } from './components/SharedReportPage.tsx';
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

// The signed-in user's reports. Anyone else is redirected as from /account.
const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  component: function Reports() {
    const settled = useFeaturesSettled();
    const signIn = useSignIn();
    const me = useMe();
    if (!settled || me.isLoading) return null;
    if (me.data) return <ReportsPage />;
    return <Navigate to={signIn ? '/signin' : '/'} replace />;
  },
});

// A signed-in user's saved report. Anyone else is redirected as from /account.
const savedReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports/$id',
  // ?version=N opens an earlier version; without it, the latest.
  validateSearch: (search: Record<string, unknown>): { version?: number } => {
    const version = Number(search.version);
    return Number.isInteger(version) && version > 0 ? { version } : {};
  },
  component: function SavedReport() {
    const settled = useFeaturesSettled();
    const signIn = useSignIn();
    const me = useMe();
    const { id } = useParams({ from: '/reports/$id' });
    const { version } = useSearch({ from: '/reports/$id' });
    if (!settled || me.isLoading) return null;
    if (me.data) return <SavedReportPage id={id} version={version} />;
    return <Navigate to={signIn ? '/signin' : '/'} replace />;
  },
});

// A shared report, for anyone with the link; the server answers 404 when sharing is off.
const sharedReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$shareId',
  component: function SharedReport() {
    const { shareId } = useParams({ from: '/s/$shareId' });
    return <SharedReportPage shareId={shareId} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  accountRoute,
  reportsRoute,
  savedReportRoute,
  sharedReportRoute,
]);

// Tests pass a memory history; the app uses the browser's.
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
