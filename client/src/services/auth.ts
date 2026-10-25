import { apiJson, clearCsrfToken } from './api';

export type User = { id: string; name: string; email: string; preferredCurrency: string };
export const authQueryKey = ['auth', 'me'] as const;
export const getMe = async () => (await apiJson<{ user: User }>('/api/auth/me')).user;
export const register = async (data: { name: string; email: string; password: string }) =>
  (await apiJson<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }, true)).user;
export async function login(data: { email: string; password: string }) {
  const result = await apiJson<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }, true);
  clearCsrfToken();
  return result.user;
}
export async function logout() {
  await apiJson<void>('/api/auth/logout', { method: 'POST' }, true);
  clearCsrfToken();
}
