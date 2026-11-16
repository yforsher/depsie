import { useQuery } from '@tanstack/react-query';
import type { Feature } from 'shared';
import { fetchFeatures } from './api';

// Read once per page load.
function useFeatures() {
  return useQuery({ queryKey: ['features'], queryFn: fetchFeatures, staleTime: Infinity });
}

// False until the server lists the flag, so flagged UI never flashes while loading and a failed
// call only hides it.
export function useFeature(name: Feature): boolean {
  return useFeatures().data?.enabled.includes(name) ?? false;
}

// Sign-in exists (accounts on, or a list of logins): /signin works even when no button is shown.
export function useSignIn(): boolean {
  return useFeatures().data?.signIn ?? false;
}

// True once the flags are known (or failed to load), so pages can wait instead of flashing.
export function useFeaturesSettled(): boolean {
  return useFeatures().isFetched;
}
