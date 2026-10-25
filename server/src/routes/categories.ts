import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { currentUserId, requireAuth } from '../middleware/require-auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { entryType, errorBody, isPrismaError, uuid } from './finance-common.js';

const createSchema = z.strictObject({ name: z.string().trim().min(1).max(80), type: entryType });
const renameSchema = z.strictObject({ name: z.string().trim().min(1).max(80) });
const publicCategory = { id: true, name: true, type: true, color: true, icon: true } as const;

export function createCategoryRouter(prisma: PrismaClient, origins: ReadonlySet<string>) {
  const router = Router();
  router.use(requireAuth);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  const csrf = requireCsrf(origins);

  router.get('/', async (request, response) => {
    const categories = await prisma.category.findMany({ where: { userId: currentUserId(request) }, select: publicCategory, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    response.json({ categories });
  });

  router.post('/', csrf, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請輸入有效的分類名稱與類型。')); return; }
    try {
      const category = await prisma.category.create({ data: { ...parsed.data, userId: currentUserId(request), color: '#267453', icon: 'folder' }, select: publicCategory });
      response.status(201).json({ category });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) { response.status(409).json(errorBody('CATEGORY_EXISTS', '此類型已有相同名稱的分類。')); return; }
      throw error;
    }
  });

  router.patch('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = renameSchema.safeParse(request.body);
    if (!id.success || !parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請輸入有效的分類資料。')); return; }
    try {
      const result = await prisma.category.updateMany({ where: { id: id.data, userId: currentUserId(request) }, data: { name: parsed.data.name } });
      if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到分類。')); return; }
      const category = await prisma.category.findFirstOrThrow({ where: { id: id.data, userId: currentUserId(request) }, select: publicCategory });
      response.json({ category });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) { response.status(409).json(errorBody('CATEGORY_EXISTS', '此類型已有相同名稱的分類。')); return; }
      if (isPrismaError(error, 'P2025')) { response.status(404).json(errorBody('NOT_FOUND', '找不到分類。')); return; }
      throw error;
    }
  });

  router.delete('/:id', csrf, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '無效的分類 ID。')); return; }
    try {
      const result = await prisma.category.deleteMany({ where: { id: id.data, userId: currentUserId(request) } });
      if (!result.count) { response.status(404).json(errorBody('NOT_FOUND', '找不到分類。')); return; }
      response.status(204).end();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) { response.status(409).json(errorBody('CATEGORY_IN_USE', '此分類已有交易或預算紀錄，請先處理相關資料後再刪除。')); return; }
      throw error;
    }
  });
  return router;
}
