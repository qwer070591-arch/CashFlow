import { apiJson } from './api';

export type EntryType = 'INCOME' | 'EXPENSE';
export type Category = { id: string; name: string; type: EntryType; color: string; icon: string };
export type Transaction = { id: string; type: EntryType; amount: string; description: string | null; transactionDate: string; createdAt: string; updatedAt: string; category: Pick<Category, 'id' | 'name' | 'type'> };
export type TransactionInput = { type: EntryType; amount: string; categoryId: string; transactionDate: string; description: string };
export const categoriesKey = ['categories'] as const;
export const transactionsKey = ['transactions'] as const;
export const analyticsKey = ['analytics'] as const;

export type TransactionQuery = {
  page: number; pageSize: number; search?: string; type?: EntryType; categoryId?: string;
  startDate?: string; endDate?: string; sortBy?: 'transactionDate' | 'amount' | 'createdAt'; sortOrder?: 'asc' | 'desc';
};
export type TransactionPage = { items: Transaction[]; page: number; pageSize: number; totalItems: number; totalPages: number };
export type DateRangeQuery = { startDate: string; endDate: string };
export type Summary = DateRangeQuery & { income: string; expense: string; balance: string; transactionCount: number };
export type TrendPoint = { month: string; income: string; expense: string };
export type CategoryTotal = { categoryId: string; categoryName: string; amount: string; transactionCount: number };

export const getCategories = async () => (await apiJson<{ categories: Category[] }>('/api/categories')).categories;
export const addCategory = async (input: { name: string; type: EntryType }) => (await apiJson<{ category: Category }>('/api/categories', { method: 'POST', body: JSON.stringify(input) }, true)).category;
export const renameCategory = async (id: string, name: string) => (await apiJson<{ category: Category }>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }, true)).category;
export const removeCategory = async (id: string) => apiJson<void>(`/api/categories/${id}`, { method: 'DELETE' }, true);
export const getTransactions = async (query: TransactionQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiJson<TransactionPage>(`/api/transactions?${params}`);
};
export const getRecentTransactions = async () => getTransactions({ page: 1, pageSize: 5 });
const rangeParams = ({ startDate, endDate }: DateRangeQuery) => new URLSearchParams({ startDate, endDate });
export const getSummary = (range: DateRangeQuery) => apiJson<Summary>(`/api/analytics/summary?${rangeParams(range)}`);
export const getTrends = (range: DateRangeQuery) => apiJson<{ points: TrendPoint[] }>(`/api/analytics/trends?${rangeParams(range)}`);
export const getCategoryTotals = (range: DateRangeQuery) => apiJson<{ items: CategoryTotal[] }>(`/api/analytics/categories?${rangeParams(range)}`);
export const addTransaction = async (input: TransactionInput) => (await apiJson<{ transaction: Transaction }>('/api/transactions', { method: 'POST', body: JSON.stringify(input) }, true)).transaction;
export const updateTransaction = async (id: string, input: TransactionInput) => (await apiJson<{ transaction: Transaction }>(`/api/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, true)).transaction;
export const removeTransaction = async (id: string) => apiJson<void>(`/api/transactions/${id}`, { method: 'DELETE' }, true);
