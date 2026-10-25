import { Router } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { z } from 'zod';
import { currentUserId, requireAuth } from '../middleware/require-auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { amount, entryType, errorBody, isPrismaError, transactionDate, uuid } from './finance-common.js';

const fields = { type: entryType, amount, categoryId: uuid, transactionDate, description: z.string().trim().max(500).optional() };
const createSchema = z.strictObject(fields);
const patchSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0);
const publicTransaction = { id: true, type: true, amount: true, description: true, transactionDate: true, createdAt: true, updatedAt: true, category: { select: { id: true, name: true, type: true } } } as const;
const exportSelect = { id: true, type: true, amount: true, description: true, transactionDate: true, category: { select: { name: true } } } as const;
const exportLimit = 5000;
const exportBatchSize = 500;
const exportQuery = z.strictObject({
  startDate: transactionDate,
  endDate: transactionDate,
  type: entryType.optional(),
  categoryId: uuid.optional(),
}).refine((query) => query.startDate <= query.endDate &&
  (Date.parse(`${query.endDate}T00:00:00.000Z`) - Date.parse(`${query.startDate}T00:00:00.000Z`)) / 86_400_000 <= 365);
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function safeSpreadsheetText(value: string) {
  let offset = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (/\s/u.test(char) || code <= 31 || (code >= 127 && code <= 159) || (code >= 0x200B && code <= 0x200D) || code === 0xFEFF) offset += char.length;
    else break;
  }
  const first = value.slice(offset, offset + 1);
  return (first !== '' && '=+-@'.includes(first)) || value.startsWith('\t') || value.startsWith('\r') || value.startsWith('\n') ? `'${value}` : value;
}
type Selected = Prisma.TransactionGetPayload<{ select: typeof publicTransaction }>;
function serialize(item: Selected) {
  return { ...item, amount: item.amount.toFixed(2), transactionDate: item.transactionDate.toISOString().slice(0, 10) };
}

export function createTransactionRouter(prisma: PrismaClient, origins: ReadonlySet<string>) {
  const router = Router();
  router.use(requireAuth);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  const csrf = requireCsrf(origins);

  const querySchema = z.strictObject({
    search: z.string().trim().max(100).optional(), type: entryType.optional(), categoryId: uuid.optional(),
    startDate: transactionDate.optional(), endDate: transactionDate.optional(),
    sortBy: z.enum(['transactionDate', 'amount', 'createdAt']).default('transactionDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }).refine((query) => !(query.pageSize && query.limit) && (!query.startDate || !query.endDate || query.startDate <= query.endDate));

  router.get('/', async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '無效的查詢參數。')); return; }
    const query = parsed.data;
    const pageSize = query.pageSize ?? query.limit ?? 20;
    const where: Prisma.TransactionWhereInput = {
      userId: currentUserId(request),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.startDate || query.endDate ? { transactionDate: { ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}), ...(query.endDate ? { lte: new Date(`${query.endDate}T00:00:00.000Z`) } : {}) } } : {}),
      ...(query.search ? { OR: [{ description: { contains: query.search, mode: 'insensitive' } }, { category: { name: { contains: query.search, mode: 'insensitive' } } }] } : {}),
    };
    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [query.sortBy]: query.sortOrder },
      ...(query.sortBy === 'transactionDate' ? [] : [{ transactionDate: 'desc' as const }]),
      ...(query.sortBy === 'createdAt' ? [] : [{ createdAt: 'desc' as const }]), { id: 'desc' },
    ];
    const [totalItems, rows] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({ where, select: publicTransaction, orderBy, skip: (query.page - 1) * pageSize, take: pageSize }),
    ], { isolationLevel: 'RepeatableRead' });
    const items = rows.map(serialize);
    const totalPages = Math.ceil(totalItems / pageSize);
    response.json({ items, page: query.page, pageSize, totalItems, totalPages, transactions: items, hasMore: query.page < totalPages });
  });

  router.get('/export', async (request, response) => {
    const parsed = exportQuery.safeParse(request.query);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請提供不超過 366 天的有效日期區間與篩選條件。')); return; }
    const { startDate, endDate, type, categoryId } = parsed.data;
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId: currentUserId(request), ...(type ? { type } : {}) }, select: { id: true } });
      if (!category) { response.status(400).json(errorBody('CATEGORY_INVALID', '請選擇自己的分類。')); return; }
    }
    const where: Prisma.TransactionWhereInput = {
      userId: currentUserId(request),
      transactionDate: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
    };
    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.transaction.count({ where });
      if (count > exportLimit) return null;
      const lines = ['交易日期,收支類型,交易名稱／說明,分類,金額,貨幣'];
      let cursor: string | undefined;
      while (true) {
        const rows = await tx.transaction.findMany({
          where, select: exportSelect, orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
          take: exportBatchSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) {
          lines.push([
            row.transactionDate.toISOString().slice(0, 10),
            row.type === 'INCOME' ? '收入' : '支出',
            safeSpreadsheetText(row.description ?? ''),
            safeSpreadsheetText(row.category.name),
            row.amount.toFixed(2), 'TWD',
          ].map(csvCell).join(','));
        }
        if (rows.length < exportBatchSize) break;
        cursor = rows.at(-1)!.id;
      }
      return { csv: lines.join('\r\n') + '\r\n', count };
    }, { isolationLevel: 'RepeatableRead' });
    if (result === null) { response.status(413).json(errorBody('EXPORT_LIMIT', `匯出資料超過 ${exportLimit} 筆，請縮小日期區間。`)); return; }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="cashflow-transactions-${startDate}_to_${endDate}.csv"`);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Export-Count', String(result.count));
    response.send(`\uFEFF${result.csv}`);
  });

  router.get('/:id', async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    const item = await prisma.transaction.findFirst({ where: { id: id.data, userId: currentUserId(request) }, select: publicTransaction });
    if (!item) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    response.json({ transaction: serialize(item) });
  });

  router.post('/', csrf, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請檢查金額、日期、類型與說明。')); return; }
    const userId = currentUserId(request);
    const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, userId, type: parsed.data.type }, select: { id: true } });
    if (!category) { response.status(400).json(errorBody('CATEGORY_INVALID', '分類不存在或與交易類型不符。')); return; }
    try {
      const item = await prisma.transaction.create({ data: { userId, categoryId: category.id, type: parsed.data.type,
        amount: new Prisma.Decimal(parsed.data.amount), description: parsed.data.description || null,
        transactionDate: new Date(`${parsed.data.transactionDate}T00:00:00.000Z`) }, select: publicTransaction });
      response.status(201).json({ transaction: serialize(item) });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) { response.status(400).json(errorBody('CATEGORY_INVALID', '分類不存在或與交易類型不符。')); return; }
      throw error;
    }
  });

  router.patch('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請檢查交易欄位。')); return; }
    const userId = currentUserId(request);
    const current = await prisma.transaction.findFirst({ where: { id: id.data, userId }, select: { type: true, categoryId: true } });
    if (!current) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    const type = parsed.data.type ?? current.type;
    const categoryId = parsed.data.categoryId ?? current.categoryId;
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId, type }, select: { id: true } });
    if (!category) { response.status(400).json(errorBody('CATEGORY_INVALID', '分類不存在或與交易類型不符。')); return; }
    try {
      const result = await prisma.transaction.updateMany({ where: { id: id.data, userId }, data: {
        ...('type' in parsed.data ? { type } : {}), ...('categoryId' in parsed.data ? { categoryId } : {}),
        ...(parsed.data.amount !== undefined ? { amount: new Prisma.Decimal(parsed.data.amount) } : {}),
        ...(parsed.data.transactionDate !== undefined ? { transactionDate: new Date(`${parsed.data.transactionDate}T00:00:00.000Z`) } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      } });
      if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
      const item = await prisma.transaction.findFirstOrThrow({ where: { id: id.data, userId }, select: publicTransaction });
      response.json({ transaction: serialize(item) });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) { response.status(400).json(errorBody('CATEGORY_INVALID', '分類不存在或與交易類型不符。')); return; }
      if (isPrismaError(error, 'P2025')) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
      throw error;
    }
  });

  router.delete('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    const result = await prisma.transaction.deleteMany({ where: { id: id.data, userId: currentUserId(request) } });
    if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到交易。')); return; }
    response.status(204).end();
  });
  return router;
}
