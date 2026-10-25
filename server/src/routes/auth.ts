import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { hash, verify, argon2id } from 'argon2';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { z } from 'zod';
import { requireAuth, currentUserId } from '../middleware/require-auth.js';
import { requireCsrf } from '../middleware/csrf.js';

const email = z.string().trim().pipe(z.email().max(320)).transform((value) => value.toLowerCase());
const password = z.string().min(12).max(128);
const registerSchema = z.strictObject({ name: z.string().trim().min(1).max(100), email, password });
const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
// A valid Argon2id hash with no account behind it keeps failed-login work similar.
const dummyHash = '$argon2id$v=19$m=19456,p=1,t=2$Ybehp5L1kYluRCpO5alZhg$sQDX3M9017Pz1m0Xu03pavQ7C2s4UrLRNRDAJfxvGfg';
const publicUser = { id: true, name: true, email: true, preferredCurrency: true } as const;
const responseError = (code: string, message: string) => ({ error: { code, message } });
const token = () => randomBytes(32).toString('base64url');

export function createAuthRouter(prisma: PrismaClient, allowedOrigins: ReadonlySet<string>, cookieName: string) {
  const router = Router();
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/csrf', (request, response) => {
    request.session.csrfToken = token();
    response.json({ csrfToken: request.session.csrfToken });
  });

  const csrf = requireCsrf(allowedOrigins);

  const limit = (max: number) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: responseError('RATE_LIMITED', '請稍後再試。'),
  });

  router.post('/register', limit(10), csrf, async (request, response) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json(responseError('VALIDATION_ERROR', '請確認姓名、Email 與密碼（至少 12 字元）。'));
      return;
    }
    try {
      const passwordHash = await hash(parsed.data.password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash }, select: publicUser });
      response.status(201).json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json(responseError('EMAIL_EXISTS', '這個 Email 已被使用。'));
        return;
      }
      throw error;
    }
  });

  router.post('/login', limit(10), csrf, async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json(responseError('VALIDATION_ERROR', '請輸入有效的 Email 與密碼。'));
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const valid = await verify(user?.passwordHash ?? dummyHash, parsed.data.password);
    if (!valid || !user) {
      response.status(401).json(responseError('INVALID_CREDENTIALS', 'Email 或密碼錯誤。'));
      return;
    }
    await new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()));
    request.session.userId = user.id;
    request.session.csrfToken = token();
    response.json({ user: { id: user.id, name: user.name, email: user.email, preferredCurrency: user.preferredCurrency } });
  });

  router.get('/me', requireAuth, async (request, response) => {
    const user = await prisma.user.findUnique({ where: { id: currentUserId(request) }, select: publicUser });
    if (!user) {
      response.status(401).json(responseError('UNAUTHORIZED', '請先登入。'));
      return;
    }
    response.json({ user });
  });

  router.post('/logout', csrf, async (request, response) => {
    await new Promise<void>((resolve, reject) => request.session.destroy((error) => error ? reject(error) : resolve()));
    response.clearCookie(cookieName, { path: '/', sameSite: 'lax', httpOnly: true });
    response.status(204).end();
  });

  return router;
}
