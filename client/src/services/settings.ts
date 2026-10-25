import { apiDownload, apiJson, clearCsrfToken } from './api';
import type { User } from './auth';
import type { EntryType } from './finance';

export const updateProfile = async (name: string) => (await apiJson<{ user: User }>('/api/users/me', { method: 'PATCH', body: JSON.stringify({ name }) }, true)).user;
export async function changePassword(currentPassword: string, newPassword: string) {
  await apiJson<void>('/api/users/me/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, true);
  clearCsrfToken();
}
export function exportTransactions(query: { startDate: string; endDate: string; type?: EntryType; categoryId?: string }) {
  const params = new URLSearchParams(query);
  return apiDownload(`/api/transactions/export?${params}`);
}
