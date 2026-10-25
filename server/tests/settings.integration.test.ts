import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { verify } from 'argon2';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const Store = connectPgSimple(session);
const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const a = request.agent(app);
const aOtherSession = request.agent(app);
const b = request.agent(app);
const emailA = `settings-a-${randomUUID()}@example.test`;
const emailB = `settings-b-${randomUUID()}@example.test`;
const originalPassword = 'Settings-Original-2026!';
const newPassword = 'Settings-Replaced-2026!';
const userIds: string[] = [];

async function csrf(agent: typeof a) { return (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken as string; }
function write(agent: typeof a, method: 'post' | 'patch', path: string, token: string, body: object) {
  return agent[method](path).set('Origin', env.CLIENT_ORIGIN).set('X-CSRF-Token', token).send(body);
}
async function registerAndLogin(agent: typeof a, email: string) {
  const registered = await write(agent, 'post', '/api/auth/register', await csrf(agent), { name: '原始名稱', email, password: originalPassword });
  expect(registered.status).toBe(201);
  userIds.push(registered.body.user.id);
  expect((await write(agent, 'post', '/api/auth/login', await csrf(agent), { email, password: originalPassword })).status).toBe(200);
  return registered.body.user.id as string;
}
async function category(agent: typeof a, token: string, name: string, type: 'INCOME' | 'EXPENSE') {
  const result = await write(agent, 'post', '/api/categories', token, { name, type });
  expect(result.status).toBe(201);
  return result.body.category.id as string;
}

beforeAll(async () => { await database.check(); });
afterAll(async () => {
  for (const id of userIds) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: id } } });
    await database.prisma.user.deleteMany({ where: { id } });
  }
  await database.disconnect();
  await pool.end();
});

it('exports precise, isolated CSV with safe spreadsheet cells and bounded results', async () => {
  const userA = await registerAndLogin(a, emailA);
  const userB = await registerAndLogin(b, emailB);
  const tokenA = await csrf(a);
  const tokenB = await csrf(b);
  const unsafeCategory = await category(a, tokenA, '=危險分類', 'EXPENSE');
  const incomeCategory = await category(a, tokenA, '薪資', 'INCOME');
  const foreignCategory = await category(b, tokenB, '他人分類', 'EXPENSE');
  await database.prisma.category.update({ where: { id: unsafeCategory }, data: { name: ' \t=危險分類' } });
  const oct = new Date('2026-10-02T00:00:00.000Z');
  await database.prisma.transaction.createMany({ data: Array.from({ length: 25 }, (_, index) => ({
    userId: userA, categoryId: unsafeCategory, type: 'EXPENSE' as const,
    amount: new Prisma.Decimal('0.10'), transactionDate: oct,
    description: index === 0 ? '=SUM(1,1)"\r\n下一行' : index === 1 ? ' \t+1+1' : '測試交易',
  })) });
  await database.prisma.transaction.create({ data: { userId: userA, categoryId: incomeCategory, type: 'INCOME', amount: new Prisma.Decimal('1250.50'), transactionDate: new Date('2026-10-31T00:00:00.000Z'), description: '薪資收入' } });
  await database.prisma.transaction.create({ data: { userId: userA, categoryId: unsafeCategory, type: 'EXPENSE', amount: new Prisma.Decimal('999.00'), transactionDate: new Date('2026-11-01T00:00:00.000Z') } });
  await database.prisma.transaction.create({ data: { userId: userB, categoryId: foreignCategory, type: 'EXPENSE', amount: new Prisma.Decimal('500.00'), transactionDate: oct } });

  const path = '/api/transactions/export?startDate=2026-10-01&endDate=2026-10-31';
  expect((await request(app).get(path)).status).toBe(401);
  expect((await a.get('/api/transactions/export')).status).toBe(400);
  expect((await a.get('/api/transactions/export?startDate=2026-02-30&endDate=2026-10-31')).status).toBe(400);
  expect((await a.get('/api/transactions/export?startDate=2025-01-01&endDate=2026-10-31')).status).toBe(400);
  expect((await a.get(`${path}&type=WRONG`)).status).toBe(400);
  expect((await a.get(`${path}&categoryId=${foreignCategory}`)).status).toBe(400);
  const exported = await a.get(path).expect(200);
  expect(exported.headers['content-type']).toContain('text/csv');
  expect(exported.headers['content-disposition']).toContain('cashflow-transactions-2026-10-01_to_2026-10-31.csv');
  expect(exported.headers['cache-control']).toContain('no-store');
  expect(exported.headers['x-export-count']).toBe('26');
  const csv = exported.text;
  expect(csv.startsWith('\uFEFF交易日期,收支類型,交易名稱／說明,分類,金額,貨幣\r\n')).toBe(true);
  expect(csv).toContain('"1250.50","TWD"');
  expect(csv).toContain('"0.10","TWD"');
  expect(csv).toContain('"\'=SUM(1,1)""\r\n下一行"');
  expect(csv).toContain('"\' \t+1+1"');
  expect(csv).toContain('"\' \t=危險分類"');
  expect(csv).not.toContain('999.00');
  expect(csv).not.toContain('500.00');
  expect((await a.get(`${path}&type=INCOME`).expect(200)).headers['x-export-count']).toBe('1');
  expect((await a.get(`${path}&type=EXPENSE&categoryId=${unsafeCategory}`).expect(200)).headers['x-export-count']).toBe('25');
  expect((await b.get(path).expect(200)).headers['x-export-count']).toBe('1');
  const empty = await a.get('/api/transactions/export?startDate=2026-12-01&endDate=2026-12-31').expect(200);
  expect(empty.headers['x-export-count']).toBe('0');
  expect(empty.text).toBe('\uFEFF交易日期,收支類型,交易名稱／說明,分類,金額,貨幣\r\n');

  for (let offset = 0; offset < 5001; offset += 1000) {
    const size = Math.min(1000, 5001 - offset);
    await database.prisma.transaction.createMany({ data: Array.from({ length: size }, () => ({
      userId: userA, categoryId: unsafeCategory, type: 'EXPENSE' as const,
      amount: new Prisma.Decimal('0.01'), transactionDate: new Date('2026-09-01T00:00:00.000Z'),
    })) });
  }
  const limited = await a.get('/api/transactions/export?startDate=2026-09-01&endDate=2026-09-30');
  expect(limited.status).toBe(413);
  expect(limited.body.error.code).toBe('EXPORT_LIMIT');
});

it('updates profile safely and revokes all sessions after password replacement', async () => {
  const tokenA = await csrf(a);
  expect((await request(app).patch('/api/users/me').send({ name: 'X' })).status).toBe(401);
  expect((await a.patch('/api/users/me').set('Origin', env.CLIENT_ORIGIN).send({ name: 'X' })).status).toBe(403);
  expect((await write(a, 'patch', '/api/users/me', tokenA, { name: '   ' })).status).toBe(400);
  expect((await write(a, 'patch', '/api/users/me', tokenA, { name: 'X', passwordHash: 'unsafe' })).status).toBe(400);
  expect((await write(a, 'patch', '/api/users/me', tokenA, { name: 'X', email: 'changed@example.test' })).status).toBe(400);
  const updated = await write(a, 'patch', '/api/users/me', tokenA, { name: '  更新名稱  ' });
  expect(updated.status).toBe(200);
  expect(updated.body.user).toMatchObject({ name: '更新名稱', email: emailA, preferredCurrency: 'TWD' });
  expect(updated.text).not.toContain('passwordHash');
  expect((await a.get('/api/auth/me')).body.user.name).toBe('更新名稱');

  expect((await write(aOtherSession, 'post', '/api/auth/login', await csrf(aOtherSession), { email: emailA, password: originalPassword })).status).toBe(200);
  expect((await aOtherSession.get('/api/auth/me')).status).toBe(200);
  expect((await request(app).post('/api/users/me/change-password').send({ currentPassword: originalPassword, newPassword })).status).toBe(401);
  expect((await write(a, 'post', '/api/users/me/change-password', 'wrong-token', { currentPassword: originalPassword, newPassword })).status).toBe(403);
  expect((await write(a, 'post', '/api/users/me/change-password', tokenA, { currentPassword: 'wrong-password', newPassword })).status).toBe(401);
  expect((await write(a, 'post', '/api/users/me/change-password', tokenA, { currentPassword: originalPassword, newPassword: originalPassword })).status).toBe(400);
  expect((await write(a, 'post', '/api/users/me/change-password', tokenA, { currentPassword: originalPassword, newPassword: 'short' })).status).toBe(400);
  const changed = await write(a, 'post', '/api/users/me/change-password', tokenA, { currentPassword: originalPassword, newPassword });
  expect(changed.status).toBe(204);
  const saved = await database.prisma.user.findUniqueOrThrow({ where: { email: emailA } });
  expect(saved.passwordHash).toMatch(/^\$argon2id\$/);
  expect(await verify(saved.passwordHash, newPassword)).toBe(true);
  expect(await verify(saved.passwordHash, originalPassword)).toBe(false);
  expect((await a.get('/api/auth/me')).status).toBe(401);
  expect((await aOtherSession.get('/api/auth/me')).status).toBe(401);
  const oldLogin = await write(aOtherSession, 'post', '/api/auth/login', await csrf(aOtherSession), { email: emailA, password: originalPassword });
  expect(oldLogin.status).toBe(401);
  const newLogin = await write(aOtherSession, 'post', '/api/auth/login', await csrf(aOtherSession), { email: emailA, password: newPassword });
  expect(newLogin.status).toBe(200);
  expect((await aOtherSession.get('/api/auth/me')).status).toBe(200);
  expect((await write(aOtherSession, 'post', '/api/auth/logout', await csrf(aOtherSession), {})).status).toBe(204);
  expect((await aOtherSession.get('/api/auth/me')).status).toBe(401);
});

it('limits repeated password-change attempts without changing the account', async () => {
  const limitedApp = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
  const limited = request.agent(limitedApp);
  expect((await write(limited, 'post', '/api/auth/login', await csrf(limited), { email: emailB, password: originalPassword })).status).toBe(200);
  const token = await csrf(limited);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await write(limited, 'post', '/api/users/me/change-password', token, { currentPassword: 'incorrect-password', newPassword })).status).toBe(401);
  }
  const blocked = await write(limited, 'post', '/api/users/me/change-password', token, { currentPassword: 'incorrect-password', newPassword });
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('RATE_LIMITED');
});
