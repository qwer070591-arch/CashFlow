import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createDatabase } from '../src/lib/database.js';
import { Prisma } from '../src/generated/prisma/client.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
const env = parseEnv();
const database = createDatabase(env.DATABASE_URL);
const pool = new Pool({ connectionString: env.DATABASE_URL });
const Store = connectPgSimple(session);
const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: false });
const app = createApp(env, database, { prisma: database.prisma, store, secret: env.SESSION_SECRET });
const a = request.agent(app);
const b = request.agent(app);
const emailA = `finance-a-${randomUUID()}@example.test`;
const emailB = `finance-b-${randomUUID()}@example.test`;
const password = 'Financial-Test-2026!';
const users: string[] = [];

async function csrf(agent: typeof a) { return (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken as string; }
async function write(agent: typeof a, method: 'post' | 'patch' | 'delete', path: string, token: string, body?: object) {
  const call = agent[method](path).set('Origin', env.CLIENT_ORIGIN).set('X-CSRF-Token', token);
  return body ? call.send(body) : call;
}
async function createAccount(agent: typeof a, email: string) {
  const register = await write(agent, 'post', '/api/auth/register', await csrf(agent), { name: 'Finance Test', email, password });
  expect(register.status).toBe(201);
  users.push(register.body.user.id);
  expect((await write(agent, 'post', '/api/auth/login', await csrf(agent), { email, password })).status).toBe(200);
  return csrf(agent);
}

beforeAll(async () => { await database.check(); });
afterAll(async () => {
  for (const id of users) {
    await database.prisma.session.deleteMany({ where: { sess: { path: ['userId'], equals: id } } });
    await database.prisma.user.delete({ where: { id } });
  }
  await database.disconnect();
  await pool.end();
});

it('persists financial CRUD while isolating two real PostgreSQL users', async () => {
  const tokenA = await createAccount(a, emailA);
  const tokenB = await createAccount(b, emailB);
  expect((await request(app).get('/api/categories')).status).toBe(401);
  expect((await request(app).get('/api/transactions')).status).toBe(401);
  expect((await request(app).post('/api/categories').send({ name: 'Other', type: 'INCOME' })).status).toBe(401);
  expect((await a.post('/api/categories').set('Origin', env.CLIENT_ORIGIN).send({ name: 'Other', type: 'INCOME' })).status).toBe(403);
  const expense = await write(a, 'post', '/api/categories', tokenA, { name: 'Food', type: 'EXPENSE' });
  const income = await write(a, 'post', '/api/categories', tokenA, { name: 'Salary', type: 'INCOME' });
  expect(expense.status).toBe(201);
  expect(income.status).toBe(201);
  const expenseId = expense.body.category.id as string;
  const incomeId = income.body.category.id as string;
  expect((await write(a, 'post', '/api/categories', tokenA, { name: 'Food', type: 'EXPENSE' })).status).toBe(409);
  expect((await write(b, 'post', '/api/categories', tokenB, { name: 'Food', type: 'EXPENSE' })).status).toBe(201);
  expect((await b.get('/api/categories')).body.categories).toHaveLength(1);
  expect((await write(b, 'patch', `/api/categories/${expenseId}`, tokenB, { name: 'Changed' })).status).toBe(404);
  expect((await write(b, 'delete', `/api/categories/${expenseId}`, tokenB)).status).toBe(404);
  await expect(database.prisma.transaction.create({ data: { userId: users[1]!, categoryId: expenseId, type: 'EXPENSE', amount: new Prisma.Decimal('1.00'), transactionDate: new Date('2024-02-29T00:00:00.000Z') } })).rejects.toMatchObject({ code: 'P2003' });
  await expect(database.prisma.transaction.create({ data: { userId: users[0]!, categoryId: expenseId, type: 'EXPENSE', amount: new Prisma.Decimal('0.00'), transactionDate: new Date('2024-02-29T00:00:00.000Z') } })).rejects.toMatchObject({ code: 'P2039' });

  const base = { type: 'EXPENSE', amount: '0.10', categoryId: expenseId, transactionDate: '2024-02-29', description: 'Lunch' };
  for (const amount of ['0', '-1', '1e2', 'NaN', 'Infinity', '1.234', '10000000000000000.00']) {
    expect((await write(a, 'post', '/api/transactions', tokenA, { ...base, amount })).status).toBe(400);
  }
  expect((await write(a, 'post', '/api/transactions', tokenA, { ...base, transactionDate: '2025-02-29' })).status).toBe(400);
  expect((await write(a, 'post', '/api/transactions', tokenA, { ...base, transactionDate: '0000-01-01' })).status).toBe(400);
  expect((await write(a, 'post', '/api/transactions', tokenA, { ...base, categoryId: incomeId })).status).toBe(400);
  expect((await write(b, 'post', '/api/transactions', tokenB, base)).status).toBe(400);
  expect((await write(a, 'post', '/api/transactions', tokenA, { ...base, userId: users[1] })).status).toBe(400);
  const out = await write(a, 'post', '/api/transactions', tokenA, base);
  expect(out.status).toBe(201);
  expect(out.body.transaction.amount).toBe('0.10');
  expect(out.body.transaction.transactionDate).toBe('2024-02-29');
  const id = out.body.transaction.id as string;
  const incoming = await write(a, 'post', '/api/transactions', tokenA, { ...base, type: 'INCOME', amount: '0.20', categoryId: incomeId, description: 'Bonus' });
  expect(incoming.status).toBe(201);
  expect(incoming.body.transaction.amount).toBe('0.20');
  expect((await a.get(`/api/transactions/${id}`)).body.transaction.transactionDate).toBe('2024-02-29');
  expect((await a.get('/api/transactions?type=EXPENSE&limit=1')).body.transactions).toHaveLength(1);
  expect((await a.get('/api/transactions?type=INCOME')).body.transactions).toHaveLength(1);
  expect((await b.get('/api/transactions')).body.transactions).toHaveLength(0);
  expect((await b.get(`/api/transactions/${id}`)).status).toBe(404);
  expect((await write(b, 'patch', `/api/transactions/${id}`, tokenB, { description: 'Stolen' })).status).toBe(404);
  expect((await write(b, 'delete', `/api/transactions/${id}`, tokenB)).status).toBe(404);
  expect((await write(a, 'patch', `/api/transactions/${id}`, tokenA, { userId: users[1] })).status).toBe(400);
  expect((await write(a, 'patch', `/api/transactions/${id}`, tokenA, { type: 'INCOME' })).status).toBe(400);
  expect((await write(a, 'patch', `/api/transactions/${id}`, tokenA, { categoryId: incomeId })).status).toBe(400);
  const changed = await write(a, 'patch', `/api/transactions/${id}`, tokenA, { amount: '0.20', description: 'Dinner', transactionDate: '2023-12-31' });
  expect(changed.status).toBe(200);
  expect(changed.body.transaction.amount).toBe('0.20');
  expect(changed.body.transaction.transactionDate).toBe('2023-12-31');
  expect((await write(a, 'patch', `/api/categories/${expenseId}`, tokenA, { name: 'Meals' })).status).toBe(200);
  expect((await a.get(`/api/transactions/${id}`)).body.transaction.category.name).toBe('Meals');
  const conflict = await write(a, 'delete', `/api/categories/${expenseId}`, tokenA);
  expect(conflict.status).toBe(409);
  expect(conflict.body.error.code).toBe('CATEGORY_IN_USE');
  expect((await write(a, 'delete', `/api/transactions/${id}`, 'bad')).status).toBe(403);
  expect((await write(a, 'delete', `/api/transactions/${id}`, tokenA)).status).toBe(204);
  expect((await write(a, 'delete', `/api/categories/${expenseId}`, tokenA)).status).toBe(204);
  expect((await a.get(`/api/transactions/${id}`)).status).toBe(404);
  expect((await database.prisma.transaction.findMany({ where: { userId: users[0] } })).length).toBe(1);
});

it('aggregates every matching transaction precisely and queries stable server pages', async () => {
  const userId = users[0]!;
  const category = await database.prisma.category.create({ data: { userId, name: `Analytics ${randomUUID().slice(0, 8)}`, type: 'EXPENSE', color: '#174f3c', icon: 'chart' } });
  const incomeCategory = await database.prisma.category.findFirstOrThrow({ where: { userId, type: 'INCOME' } });
  await database.prisma.transaction.createMany({ data: Array.from({ length: 25 }, (_, index) => ({
    userId, categoryId: category.id, type: 'EXPENSE' as const, amount: new Prisma.Decimal('0.10'),
    transactionDate: new Date('2024-02-29T00:00:00.000Z'), description: `Seed ${String(index).padStart(2, '0')}`,
  })) });
  await database.prisma.transaction.create({ data: { userId, categoryId: category.id, type: 'EXPENSE', amount: new Prisma.Decimal('1.00'), transactionDate: new Date('2024-04-30T00:00:00.000Z'), description: 'April expense' } });
  await database.prisma.transaction.create({ data: { userId, categoryId: incomeCategory.id, type: 'INCOME', amount: new Prisma.Decimal('10.00'), transactionDate: new Date('2024-03-01T00:00:00.000Z'), description: 'March income' } });

  const range = 'startDate=2024-02-01&endDate=2024-04-30';
  const summary = await a.get(`/api/analytics/summary?${range}`).expect(200);
  expect(summary.body).toMatchObject({ income: '10.20', expense: '3.50', balance: '6.70', transactionCount: 28 });
  const trends = await a.get('/api/analytics/trends?startDate=2024-02-01&endDate=2024-05-31').expect(200);
  expect(trends.body.points).toEqual([
    { month: '2024-02', income: '0.20', expense: '2.50' },
    { month: '2024-03', income: '10.00', expense: '0.00' },
    { month: '2024-04', income: '0.00', expense: '1.00' },
    { month: '2024-05', income: '0.00', expense: '0.00' },
  ]);
  const categories = await a.get(`/api/analytics/categories?${range}`).expect(200);
  expect(categories.body.items).toEqual([{ categoryId: category.id, categoryName: category.name, amount: '3.50', transactionCount: 26 }]);
  expect((await b.get(`/api/analytics/summary?${range}`).expect(200)).body).toMatchObject({ income: '0.00', expense: '0.00', balance: '0.00', transactionCount: 0 });
  expect((await request(app).get(`/api/analytics/summary?${range}`)).status).toBe(401);
  expect((await a.get('/api/analytics/summary?startDate=2022-01-01&endDate=2022-01-31').expect(200)).body.transactionCount).toBe(0);
  for (const path of ['summary', 'trends', 'categories']) {
    expect((await a.get(`/api/analytics/${path}?startDate=2024-02-30&endDate=2024-04-30`)).status).toBe(400);
    expect((await a.get(`/api/analytics/${path}?startDate=2024-05-01&endDate=2024-04-30`)).status).toBe(400);
    expect((await a.get(`/api/analytics/${path}?startDate=2024-02-01`)).status).toBe(400);
  }
  expect((await a.get('/api/analytics/trends?startDate=2022-01-01&endDate=2024-02-01')).status).toBe(400);

  const page1 = await a.get('/api/transactions?type=EXPENSE&categoryId=' + category.id + '&startDate=2024-02-01&endDate=2024-02-29&pageSize=10&page=1&sortBy=amount&sortOrder=asc').expect(200);
  expect(page1.body).toMatchObject({ page: 1, pageSize: 10, totalItems: 25, totalPages: 3 });
  expect(page1.body.items).toHaveLength(10);
  const page2 = await a.get('/api/transactions?type=EXPENSE&categoryId=' + category.id + '&startDate=2024-02-01&endDate=2024-02-29&pageSize=10&page=2&sortBy=amount&sortOrder=asc').expect(200);
  expect(page2.body.items).toHaveLength(10);
  expect(new Set([...page1.body.items, ...page2.body.items].map((item: { id: string }) => item.id)).size).toBe(20);
  const empty = await a.get('/api/transactions?search=unmatched-keyword&pageSize=10').expect(200);
  expect(empty.body).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  expect((await a.get('/api/transactions?search=Seed%2001').expect(200)).body.totalItems).toBe(1);
  expect((await a.get('/api/transactions?search=%27%20OR%201%3D1%20--').expect(200)).body.totalItems).toBe(0);
  expect((await a.get('/api/transactions?categoryId=' + category.id + '&type=INCOME').expect(200)).body.totalItems).toBe(0);
  expect((await b.get('/api/transactions?categoryId=' + category.id).expect(200)).body.totalItems).toBe(0);
  for (const query of ['pageSize=101', 'startDate=2024-02-30', 'sortBy=userId', 'startDate=2024-05-01&endDate=2024-04-30']) {
    expect((await a.get('/api/transactions?' + query)).status).toBe(400);
  }

  await database.prisma.transaction.createMany({ data: [
    { userId, categoryId: category.id, type: 'EXPENSE', amount: new Prisma.Decimal('9999999999999999.99'), transactionDate: new Date('2024-06-01T00:00:00.000Z') },
    { userId, categoryId: category.id, type: 'EXPENSE', amount: new Prisma.Decimal('0.10'), transactionDate: new Date('2024-06-01T00:00:00.000Z') },
  ] });
  const largeRange = 'startDate=2024-06-01&endDate=2024-06-01';
  expect((await a.get(`/api/analytics/summary?${largeRange}`).expect(200)).body.expense).toBe('10000000000000000.09');
  const exported = await a.get(`/api/transactions/export?${largeRange}`).expect(200);
  expect(exported.text).toContain('"9999999999999999.99"');
  expect(exported.text).toContain('"0.10"');
});
