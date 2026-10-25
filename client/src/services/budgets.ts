import { apiJson } from './api';
import type { Category } from './finance';

export const budgetsKey = ['budgets'] as const;
export type BudgetStatus = 'NORMAL' | 'NEAR_LIMIT' | 'AT_LIMIT' | 'OVER_BUDGET';
export type Budget = {
  id: string; categoryId: string | null; category: Pick<Category, 'id' | 'name' | 'type'> | null;
  month: string; amount: string; spent: string; remaining: string; usagePercent: string;
  status: BudgetStatus; createdAt: string; updatedAt: string;
};
export type BudgetSummary = {
  month: string; overallBudget: Budget | null; totalExpense: string; categoryBudgets: Budget[];
  nearLimitCount: number; atLimitCount: number; overBudgetCount: number;
};

export const getBudgets = (month: string) => apiJson<{ month: string; budgets: Budget[] }>(`/api/budgets?${new URLSearchParams({ month })}`);
export const getBudgetSummary = (month: string) => apiJson<BudgetSummary>(`/api/budgets/summary?${new URLSearchParams({ month })}`);
export const addBudget = (input: { month: string; categoryId: string | null; amount: string }) => apiJson<{ budget: Budget }>('/api/budgets', { method: 'POST', body: JSON.stringify(input) }, true);
export const updateBudget = (id: string, amount: string) => apiJson<{ budget: Budget }>(`/api/budgets/${id}`, { method: 'PATCH', body: JSON.stringify({ amount }) }, true);
export const removeBudget = (id: string) => apiJson<void>(`/api/budgets/${id}`, { method: 'DELETE' }, true);
