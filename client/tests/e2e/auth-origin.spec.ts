import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { expect, test as base } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../../../server/src/app';
import { parseEnv } from '../../../server/src/config/env';
import { createDatabase } from '../../../server/src/lib/database';

config({ path: '.env' });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const database = createDatabase(databaseUrl);
const email = `origin-${randomBytes(6).toString('hex')}@example.test`;

const test = base.extend<{ proxyOrigin: string }>({
  // Keep this origin/proxy check independent of the shared development API's IP rate counter.
  // eslint-disable-next-line no-empty-pattern
  proxyOrigin: async ({}, use) => {
    const env = parseEnv();
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const Store = connectPgSimple(session);
    const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
    let app: ReturnType<typeof createApp> | undefined;
    const apiServer = createHttpServer((request, response) => {
      if (!app) { response.writeHead(503).end(); return; }
      app(request, response);
    });
    let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
    try {
      await database.check();
      await new Promise<void>((resolveListen) => apiServer.listen(0, '127.0.0.1', resolveListen));
      const apiPort = (apiServer.address() as AddressInfo).port;
      vite = await createViteServer({
        configFile: resolve('client/vite.config.ts'),
        root: resolve('client'),
        server: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
      });
      await vite.listen();
      const webPort = (vite.httpServer!.address() as AddressInfo).port;
      app = createApp({ ...env, CLIENT_ORIGIN: `http://127.0.0.1:${webPort}` }, database, {
        prisma: database.prisma,
        store,
        secret: env.SESSION_SECRET,
      });
      await use(`http://localhost:${webPort}`);
    } finally {
      await vite?.close();
      if (apiServer.listening) await new Promise<void>((resolveClose) => apiServer.close(() => resolveClose()));
      await pool.end();
    }
  },
});

test.afterAll(async () => {
  const user = await database.prisma.user.findUnique({ where: { email } });
  if (user) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: user.id } } });
    await database.prisma.user.delete({ where: { id: user.id } });
  }
  await database.disconnect();
});

test('register from localhost through the Vite proxy', async ({ page, proxyOrigin }) => {
  const metadata: Array<{ status: number; origin: string | undefined; host: string; cookie: boolean; csrf: boolean }> = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('/api/auth/register')) return;
    const headers = await response.request().allHeaders();
    metadata.push({
      status: response.status(),
      origin: headers.origin,
      host: new URL(response.request().url()).host,
      cookie: Boolean(headers.cookie),
      csrf: Boolean(headers['x-csrf-token']),
    });
  });
  await page.goto(`${proxyOrigin}/register`);
  const api = `${proxyOrigin}/api/auth`;
  const origin = proxyOrigin;
  const invalidRegister = { name: '來源測試', email, password: `Local-${randomBytes(12).toString('base64url')}` };
  expect((await page.request.post(`${api}/register`, { headers: { Origin: origin }, data: invalidRegister })).status()).toBe(403);
  expect((await page.request.post(`${api}/register`, { headers: { Origin: origin, 'X-CSRF-Token': 'invalid' }, data: invalidRegister })).status()).toBe(403);
  await page.getByLabel('姓名').fill('來源測試');
  await page.getByLabel('Email').fill(email);
  const password = `Local-${randomBytes(12).toString('base64url')}`;
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('確認密碼').fill(password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect.poll(() => metadata.length).toBeGreaterThan(0);
  expect(metadata).toContainEqual({ status: 201, origin, host: new URL(origin).host, cookie: true, csrf: true });
  await expect(page).toHaveURL(origin + '/login');

  expect((await page.request.post(`${api}/login`, { headers: { Origin: origin }, data: { email, password } })).status()).toBe(403);
  expect((await page.request.post(`${api}/login`, { headers: { Origin: origin, 'X-CSRF-Token': 'invalid' }, data: { email, password } })).status()).toBe(403);
  const anonymousCookie = (await page.context().cookies(origin)).find((item) => item.name === 'cashflow.sid');
  expect(anonymousCookie).toBeDefined();
  const anonymousSid = decodeURIComponent(anonymousCookie!.value).slice(2).split('.')[0]!;
  await database.prisma.session.update({ where: { sid: anonymousSid }, data: { expire: new Date(Date.now() - 1000) } });
  const loginStatuses: number[] = [];
  page.on('response', (response) => { if (response.url().endsWith('/api/auth/login')) loginStatuses.push(response.status()); });
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼', { exact: true }).press('Enter');
  await expect(page).toHaveURL(origin + '/');
  expect(loginStatuses).toEqual([403, 200]);
  await page.reload();
  await expect(page.getByRole('heading', { name: /讓每一筆收支/ })).toBeVisible();

  expect((await page.request.post(`${api}/logout`, { headers: { Origin: origin } })).status()).toBe(403);
  expect((await page.request.post(`${api}/logout`, { headers: { Origin: origin, 'X-CSRF-Token': 'invalid' } })).status()).toBe(403);
  expect((await page.request.get(`${api}/me`)).status()).toBe(200);
  await page.getByRole('banner').getByRole('button', { name: '帳號選單' }).click();
  await page.getByRole('banner').getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(origin + '/login');
  expect((await page.request.get(`${api}/me`)).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: '歡迎回來' })).toBeVisible();
});
