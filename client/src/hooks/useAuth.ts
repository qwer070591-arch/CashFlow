import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../services/api';
import { authQueryKey, getMe } from '../services/auth';

export function useAuth() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: getMe,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}
