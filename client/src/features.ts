import { useQuery } from '@tanstack/react-query';
import type { Feature } from 'shared';
import { fetchFeatures } from './api';

// False until the server lists the flag, so flagged UI never flashes while loading and a failed
// call only hides it.
export function useFeature(name: Feature): boolean {
  const { data } = useQuery({
    queryKey: ['features'],
    queryFn: fetchFeatures,
    staleTime: Infinity,
  });
  return data?.enabled.includes(name) ?? false;
}
