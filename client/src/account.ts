import { useQuery } from '@tanstack/react-query';
import { createAuthClient } from 'better-auth/react';
import { fetchMe } from './api';
import { useFeature } from './features';

// Better Auth's routes are on this origin under /api/auth (proxied to the server in development).
// Its client keeps the fetch it finds when created; looking it up on each call lets the tests stub
// fetch like every other server call.
export const authClient = createAuthClient({
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
});

// The signed-in user; asked for only while accounts is on for this visitor, so with the flag off
// the page makes no extra request.
export function useMe() {
  const accounts = useFeature('accounts');
  return useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: accounts });
}
