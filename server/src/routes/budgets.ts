import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { currentUserId, requireAuth } from '../middleware/require-auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { amount, errorBody, isPrismaError, uuid } from './finance-common.js';
import { defaultMonth } from './date-range.js';

const monthSchema = z.string().regex(/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/);
const monthQuery = z.strictObject({ month: monthSchema.optional() });
const createSchema = z.strictObject({ month: monthSchema, categoryId: uuid.nullable(), amount });
const patchSchema = z.strictObject({ amount });
const budgetSelect = { id: true, categoryId: true, month: true, amount: true, createdAt: true, updatedAt: true, category: { select: { id: true, name: true, type: true } } } as const;
type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof budgetSelect }>;
type SpendingGroup = { categoryId: string; _sum: { amount: Prisma.Decimal | null } };
const zero = new Prisma.Decimal(0);

function monthBounds(month: string) {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const start = new Date(0);
  start.setUTCFullYear(year, number - 1, 1);
  start.setUTCHours(0, 0, 0, 0);
  const next = new Date(0);
  next.setUTCFullYear(year, number, 1);
  next.setUTCHours(0, 0, 0, 0);
  return { start, next };
}

function status(spent: Prisma.Decimal, limit: Prisma.Decimal) {
  if (spent.greaterThan(limit)) return 'OVER_BUDGET' as const;
  if (spent.equals(limit)) return 'AT_LIMIT' as const;
  if (spent.mul(100).greaterThanOrEqualTo(limit.mul(80))) return 'NEAR_LIMIT' as const;
  return 'NORMAL' as const;
}

function serialize(row: BudgetRow, spending: Map<string, Prisma.Decimal>, totalExpense: Prisma.Decimal) {
  const spent = row.categoryId === null ? totalExpense : (spending.get(row.categoryId) ?? zero);
  return {
    id: row.id, categoryId: row.categoryId, category: row.category, month: row.month.toISOString().slice(0, 7),
    amount: row.amount.toFixed(2), spent: spent.toFixed(2), remaining: row.amount.minus(spent).toFixed(2),
    usagePercent: spent.div(row.amount).mul(100).toFixed(2), status: status(spent, row.amount),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

async function monthlyData(prisma: PrismaClient, userId: string, month: string) {
  const { start, next } = monthBounds(month);
  const [budgets, groups] = await prisma.$transaction([
    prisma.budget.findMany({ where: { userId, month: start }, select: budgetSelect, orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }] }),
    prisma.transaction.groupBy({ by: ['categoryId'], where: { userId, type: 'EXPENSE', transactionDate: { gte: start, lt: next } }, orderBy: { categoryId: 'asc' }, _sum: { amount: true } }),
  ], { isolationLevel: 'RepeatableRead' });
  const spending = new Map((groups as SpendingGroup[]).map((group) => [group.categoryId, group._sum.amount ?? zero]));
  const totalExpense = [...spending.values()].reduce((total, value) => total.plus(value), zero);
  const items = budgets.map((budget) => serialize(budget, spending, totalExpense));
  return { items, totalExpense };
}

function requestedMonth(query: Record<string, unknown>) {
  const parsed = monthQuery.safeParse(query);
  return parsed.success ? (parsed.data.month ?? defaultMonth().startDate.slice(0, 7)) : null;
}

export function createBudgetRouter(prisma: PrismaClient, origins: ReadonlySet<string>) {
  const router = Router();
  router.use(requireAuth);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  const csrf = requireCsrf(origins);

  router.get('/', async (request, response) => {
    const month = requestedMonth(request.query);
    if (!month) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供有效的月份。')); return; }
    const data = await monthlyData(prisma, currentUserId(request), month);
    response.json({ month, budgets: data.items });
  });

  router.get('/summary', async (request, response) => {
    const month = requestedMonth(request.query);
    if (!month) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供有效的月份。')); return; }
    const { items, totalExpense } = await monthlyData(prisma, currentUserId(request), month);
    const overallBudget = items.find((item) => item.categoryId === null) ?? null;
    const categoryBudgets = items.filter((item) => item.categoryId !== null);
    response.json({ month, overallBudget, totalExpense: totalExpense.toFixed(2), categoryBudgets,
      nearLimitCount: categoryBudgets.filter((item) => item.status === 'NEAR_LIMIT').length,
      atLimitCount: categoryBudgets.filter((item) => item.status === 'AT_LIMIT').length,
      overBudgetCount: categoryBudgets.filter((item) => item.status === 'OVER_BUDGET').length });
  });

  router.get('/:id', async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    const userId = currentUserId(request);
    const row = await prisma.budget.findFirst({ where: { id: id.data, userId }, select: budgetSelect });
    if (!row) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    const month = row.month.toISOString().slice(0, 7);
    const data = await monthlyData(prisma, userId, month);
    const budget = data.items.find((item) => item.id === id.data);
    if (!budget) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    response.json({ budget });
  });

  router.post('/', csrf, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請檢查月份、分類及金額。')); return; }
    const userId = currentUserId(request);
    const { month, categoryId } = parsed.data;
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId, type: 'EXPENSE' }, select: { id: true } });
      if (!category) { response.status(400).json(errorBody('CATEGORY_INVALID', '請選擇自己的支出分類。')); return; }
    }
    try {
      const row = await prisma.budget.create({ data: { userId, categoryId, month: monthBounds(month).start, amount: new Prisma.Decimal(parsed.data.amount) }, select: budgetSelect });
      const data = await monthlyData(prisma, userId, month);
      response.status(201).json({ budget: data.items.find((item) => item.id === row.id) });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) { response.status(409).json(errorBody('BUDGET_EXISTS', '此月份已有相同範圍的預算。')); return; }
      if (isPrismaError(error, 'P2003')) { response.status(400).json(errorBody('CATEGORY_INVALID', '請選擇自己的支出分類。')); return; }
      throw error;
    }
  });

  router.patch('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請輸入有效的預算金額。')); return; }
    const userId = currentUserId(request);
    const result = await prisma.budget.updateMany({ where: { id: id.data, userId }, data: { amount: new Prisma.Decimal(parsed.data.amount) } });
    if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    const row = await prisma.budget.findFirstOrThrow({ where: { id: id.data, userId }, select: budgetSelect });
    const data = await monthlyData(prisma, userId, row.month.toISOString().slice(0, 7));
    response.json({ budget: data.items.find((item) => item.id === id.data) });
  });

  router.delete('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    const result = await prisma.budget.deleteMany({ where: { id: id.data, userId: currentUserId(request) } });
    if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到預算。')); return; }
    response.status(204).end();
  });
  return router;
}
