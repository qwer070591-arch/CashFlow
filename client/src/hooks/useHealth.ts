import { useQuery } from '@tanstack/react-query';
import { getApiHealth, getDatabaseHealth } from '../services/health';

export function useHealth() {
  const api = useQuery({ queryKey: ['health', 'api'], queryFn: getApiHealth });
  const database = useQuery({ queryKey: ['health', 'database'], queryFn: getDatabaseHealth, retry: false });
  return { api, database };
}
