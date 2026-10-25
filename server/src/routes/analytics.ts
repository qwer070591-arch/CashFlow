import { Router } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { currentUserId, requireAuth } from '../middleware/require-auth.js';
import { errorBody } from './finance-common.js';
import { parseDateRange } from './date-range.js';

const zero = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal | null | undefined) => (value ?? zero).toFixed(2);
const dateWhere = (start: Date, end: Date) => ({ gte: start, lte: end });

export function createAnalyticsRouter(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/summary', async (request, response) => {
    const range = parseDateRange(request.query, true);
    if (!range) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供有效的起迄日期。')); return; }
    const groups = await prisma.transaction.groupBy({ by: ['type'], where: { userId: currentUserId(request), transactionDate: dateWhere(range.start, range.end) }, _sum: { amount: true }, _count: { _all: true } });
    const income = groups.find((item) => item.type === 'INCOME')?._sum.amount ?? zero;
    const expense = groups.find((item) => item.type === 'EXPENSE')?._sum.amount ?? zero;
    response.json({ startDate: range.startDate, endDate: range.endDate, income: money(income), expense: money(expense), balance: income.minus(expense).toFixed(2), transactionCount: groups.reduce((count, item) => count + item._count._all, 0) });
  });

  router.get('/trends', async (request, response) => {
    const range = parseDateRange(request.query, true);
    if (!range) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供有效的起迄日期。')); return; }
    const startMonth = range.startDate.slice(0, 7);
    const endMonth = range.endDate.slice(0, 7);
    const monthCount = (Number(endMonth.slice(0, 4)) - Number(startMonth.slice(0, 4))) * 12 + Number(endMonth.slice(5, 7)) - Number(startMonth.slice(5, 7)) + 1;
    if (monthCount > 24) { response.status(400).json(errorBody('VALIDATION_ERROR', '趨勢查詢最多 24 個月份。')); return; }
    const rows = await prisma.$queryRaw<Array<{ month: string; type: 'INCOME' | 'EXPENSE'; amount: Prisma.Decimal }>>`
      SELECT to_char(date_trunc('month', "transactionDate"), 'YYYY-MM') AS month, type, SUM(amount) AS amount
      FROM "Transaction"
      WHERE "userId" = ${currentUserId(request)}::uuid AND "transactionDate" BETWEEN ${range.startDate}::date AND ${range.endDate}::date
      GROUP BY month, type ORDER BY month ASC`;
    const points = Array.from({ length: monthCount }, (_, index) => {
      const first = new Date(Date.UTC(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)) - 1 + index, 1));
      const month = first.toISOString().slice(0, 7);
      return { month, income: money(rows.find((row) => row.month === month && row.type === 'INCOME')?.amount), expense: money(rows.find((row) => row.month === month && row.type === 'EXPENSE')?.amount) };
    });
    response.json({ startDate: range.startDate, endDate: range.endDate, points });
  });

  router.get('/categories', async (request, response) => {
    const range = parseDateRange(request.query, true);
    if (!range) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供有效的起迄日期。')); return; }
    const userId = currentUserId(request);
    const groups = await prisma.transaction.groupBy({ by: ['categoryId'], where: { userId, type: 'EXPENSE', transactionDate: dateWhere(range.start, range.end) }, _sum: { amount: true }, _count: { _all: true } });
    const categories = groups.length ? await prisma.category.findMany({ where: { userId, id: { in: groups.map((item) => item.categoryId) } }, select: { id: true, name: true } }) : [];
    const names = new Map(categories.map((item) => [item.id, item.name]));
    const items = groups.map((item) => ({ categoryId: item.categoryId, categoryName: names.get(item.categoryId) ?? '已刪除分類', amount: money(item._sum.amount), transactionCount: item._count._all })).sort((a, b) => new Prisma.Decimal(b.amount).comparedTo(a.amount));
    response.json({ startDate: range.startDate, endDate: range.endDate, items });
  });
  return router;
}
