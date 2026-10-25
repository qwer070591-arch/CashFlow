import { Router } from 'express';
import { hash, verify, argon2id } from 'argon2';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { currentUserId, requireAuth } from '../middleware/require-auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { errorBody } from './finance-common.js';

const profileSchema = z.strictObject({ name: z.string().trim().min(1).max(100) });
const passwordSchema = z.strictObject({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) });
const publicUser = { id: true, name: true, email: true, preferredCurrency: true } as const;

export function createUserRouter(prisma: PrismaClient, origins: ReadonlySet<string>, cookieName: string) {
  const router = Router();
  router.use(requireAuth);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  const csrf = requireCsrf(origins);

  router.patch('/me', csrf, async (request, response) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請輸入 1 至 100 字元的名稱。')); return; }
    const user = await prisma.user.update({ where: { id: currentUserId(request) }, data: { name: parsed.data.name }, select: publicUser });
    response.json({ user });
  });

  const passwordLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: errorBody('RATE_LIMITED', '密碼修改嘗試過多，請稍後再試。'),
  });

  router.post('/me/change-password', passwordLimit, csrf, async (request, response) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(errorBody('VALIDATION_ERROR', '請檢查目前密碼與新密碼（至少 12 字元）。')); return; }
    const userId = currentUserId(request);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) { response.status(401).json(errorBody('UNAUTHORIZED', '請重新登入。')); return; }
    if (!await verify(user.passwordHash, parsed.data.currentPassword)) {
      response.status(401).json(errorBody('CURRENT_PASSWORD_INVALID', '目前密碼不正確。'));
      return;
    }
    if (await verify(user.passwordHash, parsed.data.newPassword)) {
      response.status(400).json(errorBody('PASSWORD_UNCHANGED', '新密碼不可與目前密碼相同。'));
      return;
    }
    const passwordHash = await hash(parsed.data.newPassword, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (!result.count) return false;
      await tx.session.deleteMany({ where: { sess: { path: ['userId'], equals: userId } } });
      return true;
    });
    if (!updated) { response.status(409).json(errorBody('PASSWORD_CHANGED', '密碼已在其他地方更新，請重新登入。')); return; }
    response.clearCookie(cookieName, { path: '/', sameSite: 'lax', httpOnly: true });
    response.status(204).end();
  });

  return router;
}
